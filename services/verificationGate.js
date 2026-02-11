// ./services/verificationGate.js
const { config } = require("../config/botConfig");
const { welcomeMessages } = require("../config/welcomeMessages");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { openDb } = require("../db/db");
const { initMessageCacheDb } = require("../utils/messageCache");
const queries = require("../db/queries");

let db = null;
let poller = null;
let impersonationHealthPoller = null;
const suppressedVerification = new Map();
const DUPLICATE_ALERT_DM_THROTTLE_MS = 4 * 60 * 60 * 1000;
const IMPERSONATION_HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const ISSUE_ALERT_THROTTLE_MS = 4 * 60 * 60 * 1000;

function suppressVerification(userId, ttlMs = 60000) {
  suppressedVerification.set(userId, Date.now() + ttlMs);
}

function isVerificationSuppressed(userId) {
  const expiry = suppressedVerification.get(userId);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    suppressedVerification.delete(userId);
    return false;
  }
  return true;
}

function hasRole(member, roleId) {
  return member?.roles?.cache?.has(roleId);
}

function normalizeName(name) {
  if (!name) return "";
  return name.trim().toLowerCase();
}

function getMemberCheckName(member) {
  return (
    member.displayName ||
    member.nickname ||
    member.user?.globalName ||
    member.user?.username ||
    ""
  );
}

async function getActiveProtectedPrincipals(guildId) {
  return queries.getActiveProtectedPrincipals(db, guildId);
}

async function isProtectedId(guildId, userId) {
  return queries.isActiveProtectedPrincipal(db, { guildId, userId });
}

async function getProtectedNameSet(guildId) {
  const exactNames = new Set();
  const principalRows = await getActiveProtectedPrincipals(guildId);
  for (const row of principalRows) {
    const normalized = normalizeName(row.current_name);
    if (normalized) exactNames.add(normalized);
  }
  const aliasRows = queries.getActiveProtectedAliases(db, guildId);
  for (const row of aliasRows) {
    const normalized = normalizeName(row.alias_name);
    if (normalized) exactNames.add(normalized);
  }
  return exactNames;
}

async function isImpersonation(guildId, targetName, memberId) {
  if (await isProtectedId(guildId, memberId)) return false;
  const raw = normalizeName(targetName);
  if (!raw) return false;
  const protectedNamesSet = await getProtectedNameSet(guildId);
  return protectedNamesSet.has(raw);
}

function isUnknownMemberError(err) {
  return err && (err.code === 10007 || err.code === 10013);
}

async function initVerificationGate(client) {
  db = await openDb(config.dbPath);
  await queries.initSchema(db);
  initMessageCacheDb(db);
  await runImpersonationHealthCheck(client);
  startImpersonationHealthPoller(client);
  startPoller(client);
}

async function handleMemberAdd(member) {
  if (!db) throw new Error("DB not initialized");
  if (member.guild.id !== config.guildId) return;

  if (member.user?.bot) {
    await addAutomataRole(member);
    return;
  }

  const existingState = queries.getState(db, {
    guildId: member.guild.id,
    userId: member.id,
  });

  if (existingState?.status === "jailed" && !member.user?.bot) {
    await applyJailOnJoin(member);
    return;
  }

  const joinName = getMemberCheckName(member);
  if (await isImpersonation(member.guild.id, joinName, member.id)) {
    await applyJailOnJoin(member);
    await sendAdminLog(member.client, {
      title: "Impersonation Detected (Join)",
      description: `${member.user.tag} moved to interment on join.`,
      color: 0xff5722,
      fields: [
        { name: "User", value: `<@${member.id}>`, inline: true },
        { name: "User ID", value: member.id, inline: true },
        { name: "Name", value: joinName || "*(none)*", inline: true },
      ],
    });
    log.info(
      `[impersonation] join interment user=${member.user.tag} name=${joinName}`
    );
    return;
  }

  await addInitiateRole(member);

  const now = Date.now();
  const deadlineAt = now + config.verifyTimeoutMs;

  await queries.upsertPending(db, {
    guildId: member.guild.id,
    userId: member.id,
    joinAt: now,
    deadlineAt,
  });

  let joinStatus = "pending";
  if (hasRole(member, config.roleVerifiedId)) {
    await queries.setVerified(db, {
      guildId: member.guild.id,
      userId: member.id,
      at: now,
    });
    joinStatus = "verified";
  } else if (hasRole(member, config.roleJailId)) {
    await queries.setJailed(db, {
      guildId: member.guild.id,
      userId: member.id,
      at: now,
    });
    joinStatus = "jailed";
  }

  await queries.logModeration(db, {
    guildId: member.guild.id,
    userId: member.id,
    action: "join",
    status: joinStatus,
    details: `deadline_at=${deadlineAt}`,
    at: now,
  });

  log.info(
    `Member joined: ${member.user.tag} (${member.id}), deadline ${new Date(
      deadlineAt
    ).toISOString()}`
  );

  await clearRulesReaction(member);
  await sendWelcome(member);
}

async function handleMemberUpdate(oldMember, newMember) {
  if (!db) throw new Error("DB not initialized");
  if (newMember.guild.id !== config.guildId) return;

  if (oldMember.partial) {
    try {
      await oldMember.fetch();
    } catch (err) {
      log.warn("Failed to fetch partial old member on update.", err);
    }
  }

  if (newMember.partial) {
    try {
      await newMember.fetch();
    } catch (err) {
      log.warn("Failed to fetch partial new member on update.", err);
      return;
    }
  }

  const hadVerified = hasRole(oldMember, config.roleVerifiedId);
  const hasVerified = hasRole(newMember, config.roleVerifiedId);
  const hadJailed = hasRole(oldMember, config.roleJailId);
  const hasJailed = hasRole(newMember, config.roleJailId);
  const hadInitiate = hasRole(oldMember, config.roleInitiateId);
  const hasInitiate = hasRole(newMember, config.roleInitiateId);

  if (!hadVerified && hasVerified) {
    const now = Date.now();
    await queries.setVerified(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      action: "verified",
      status: "success",
      at: now,
    });
    log.info(`Member verified: ${newMember.user.tag} (${newMember.id})`);
  }

  if (!hadJailed && hasJailed) {
    const now = Date.now();
    await queries.setJailed(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      action: "jailed",
      status: "success",
      at: now,
    });
    log.info(`Member jailed: ${newMember.user.tag} (${newMember.id})`);
  }

  if (
    !newMember.user?.bot &&
    !hadInitiate &&
    hasInitiate &&
    !hasVerified &&
    !hasJailed
  ) {
    const now = Date.now();
    const deadlineAt = now + config.verifyTimeoutMs;
    await queries.upsertPending(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      joinAt: now,
      deadlineAt,
    });
    await queries.logModeration(db, {
      guildId: newMember.guild.id,
      userId: newMember.id,
      action: "initiate",
      status: "pending",
      details: `deadline_at=${deadlineAt}`,
      at: now,
    });
    log.info(`Initiate re-verified: ${newMember.user.tag} (${newMember.id})`);
  }

  if (rolesChanged(oldMember, newMember)) {
    await enforceSingleRole(newMember);
  }
}

async function sendWelcome(member) {
  if (!Array.isArray(welcomeMessages) || welcomeMessages.length === 0) return;

  let channel;
  try {
    channel = await member.client.channels.fetch(config.welcomeChannelId);
  } catch (err) {
    log.warn("Failed to fetch welcome channel.", err);
    return;
  }

  if (!channel || !channel.isTextBased()) {
    log.warn("Welcome channel is missing or not text-based.");
    return;
  }

  const state = queries.getWelcomeState(db, { guildId: member.guild.id });
  const lastIndex = Number.isFinite(state?.last_index) ? state.last_index : 0;
  const nextIndex = lastIndex % welcomeMessages.length;
  const template = welcomeMessages[nextIndex];
  const content = template.replaceAll("{user}", `<@${member.id}>`);

  try {
    await channel.send(content);
    const newIndex = (nextIndex + 1) % welcomeMessages.length;
    queries.setWelcomeState(db, {
      guildId: member.guild.id,
      lastIndex: newIndex,
      at: Date.now(),
    });
  } catch (err) {
    log.warn("Failed to send welcome message.", err);
  }
}

function rolesChanged(oldMember, newMember) {
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) return true;
  for (const role of oldMember.roles.cache.values()) {
    if (!newMember.roles.cache.has(role.id)) return true;
  }
  return false;
}

async function enforceSingleRole(member) {
  if (member.user?.bot) return;

  const roles = member.roles.cache.filter(
    (role) => !role.managed && role.id !== member.guild.id
  );
  if (roles.size <= 1) return;

  const keepRole = roles.reduce((prev, current) =>
    current.position > prev.position ? current : prev
  );

  const toRemove = roles.filter((role) => role.id !== keepRole.id);
  if (toRemove.size === 0) return;

  try {
    await member.roles.remove(
      toRemove.map((role) => role.id),
      "Enforcing single-role policy."
    );
  } catch (err) {
    log.warn(`Failed to enforce single-role policy for ${member.id}.`, err);
  }
}

async function clearRulesReaction(member) {
  const rulesConfig = queries.getRulesMessage(db, { guildId: member.guild.id });
  if (!rulesConfig) return;

  let channel;
  try {
    channel = await member.client.channels.fetch(rulesConfig.channel_id);
  } catch (err) {
    log.warn("Failed to fetch rules channel for reaction cleanup.", err);
    return;
  }

  if (!channel || !channel.isTextBased()) return;

  let message;
  try {
    message = await channel.messages.fetch(rulesConfig.message_id);
  } catch (err) {
    log.warn("Failed to fetch rules message for reaction cleanup.", err);
    return;
  }

  const reaction = message.reactions.cache.find(
    (r) => r.emoji?.name === config.rulesEmoji
  );
  if (!reaction) return;

  try {
    const users = await reaction.users.fetch();
    if (!users.has(member.id)) return;
    await reaction.users.remove(member.id);
  } catch (err) {
    log.warn("Failed to remove existing rules reaction on join.", err);
  }
}

async function addInitiateRole(member) {
  if (member.roles.cache.has(config.roleInitiateId)) return;
  try {
    await member.roles.add(config.roleInitiateId, "Assigned on join.");
  } catch (err) {
    log.warn(`Failed to add initiate role to ${member.id}.`, err);
  }
}

async function addAutomataRole(member) {
  if (member.roles.cache.has(config.roleAutomataId)) return;
  try {
    await member.roles.add(config.roleAutomataId, "Assigned to bot on join.");
  } catch (err) {
    log.warn(`Failed to add Automata role to ${member.id}.`, err);
  }
}

async function applyJailOnJoin(member) {
  try {
    await member.roles.set([config.roleJailId], "Rejoin while jailed.");
    await queries.setJailed(db, {
      guildId: member.guild.id,
      userId: member.id,
      at: Date.now(),
    });
    await queries.logModeration(db, {
      guildId: member.guild.id,
      userId: member.id,
      action: "rejoin_jailed",
      status: "jailed",
      at: Date.now(),
    });
    log.info(`Member rejoined while jailed: ${member.user.tag} (${member.id})`);
  } catch (err) {
    log.warn(`Failed to reapply jail role on join for ${member.id}.`, err);
  }
}

async function fetchCurrentProtectedName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return getMemberCheckName(member);
  } catch {
    // fall back to user fetch
  }

  try {
    const user = await guild.client.users.fetch(userId);
    return (user.globalName || user.username || "").trim();
  } catch {
    return "";
  }
}

async function refreshActiveProtectedPrincipalNames(guild) {
  const rows = await queries.getActiveProtectedPrincipals(db, guild.id);
  const refreshed = [];

  for (const row of rows) {
    const currentName = await fetchCurrentProtectedName(guild, row.user_id);
    if (
      currentName &&
      normalizeName(currentName) !== normalizeName(row.current_name || "")
    ) {
      queries.updateProtectedPrincipalName(db, {
        guildId: guild.id,
        userId: row.user_id,
        currentName,
        at: Date.now(),
      });
      row.current_name = currentName;
    }
    refreshed.push(row);
  }

  return refreshed;
}

function getProtectedRoleMembers(guild) {
  const members = new Map();

  for (const roleId of config.protectedRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      log.warn(`[impersonation] protected role missing in guild: ${roleId}`);
      continue;
    }

    for (const member of role.members.values()) {
      members.set(member.id, member);
    }
  }

  return Array.from(members.values());
}

async function maybeSendThrottledDuplicateDm(guild, name, rows) {
  const now = Date.now();
  const throttleKey = `protected_name_conflict_dm:${guild.id}:${name}`;
  const lastSent = queries.getAlertThrottle(db, throttleKey);
  if (
    lastSent?.last_sent_at &&
    now - Number(lastSent.last_sent_at) < DUPLICATE_ALERT_DM_THROTTLE_MS
  ) {
    return;
  }

  queries.setAlertThrottle(db, { key: throttleKey, at: now });

  const protectedRoleMembers = getProtectedRoleMembers(guild);
  if (protectedRoleMembers.length === 0) return;

  const canonical = getCanonicalProtectedRow(rows);
  const displayName = canonical?.current_name || name;
  const conflictSummary = `${displayName}: ${rows
    .map((row) => row.user_id)
    .join(", ")}`;

  const dmText =
    "Liquidity Shield alert: duplicate protected names detected.\n\n" +
    conflictSummary.slice(0, 1700);

  for (const member of protectedRoleMembers) {
    try {
      await member.send(dmText);
    } catch (err) {
      log.warn(
        `[impersonation] failed DM alert to ${member.user?.tag || member.id}.`,
        err
      );
    }
  }
}

function getCanonicalProtectedRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aCreated = Number(a.created_at || 0);
    const bCreated = Number(b.created_at || 0);
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.user_id || "").localeCompare(String(b.user_id || ""));
  })[0];
}

function formatProtectedNameWithId(row, fallbackName) {
  const name = row?.current_name || fallbackName || "unknown";
  const userId = row?.user_id || "unknown";
  return `${name} (${userId})`;
}

function buildDuplicateNameEntries(principalRows, aliasRows) {
  const entries = [];

  for (const row of principalRows) {
    const normalized = normalizeName(row.current_name);
    if (!normalized) continue;
    entries.push({
      normalized,
      user_id: row.user_id,
      current_name: row.current_name,
      created_at: row.created_at,
    });
  }

  for (const row of aliasRows) {
    const normalized = normalizeName(row.alias_name);
    if (!normalized) continue;
    entries.push({
      normalized,
      user_id: row.user_id,
      current_name: row.alias_name,
      created_at: row.created_at,
    });
  }

  return entries;
}

async function sendIssueAlert(client, issue) {
  log.warn(issue.warn);
  await sendAdminLog(client, {
    title: issue.title,
    description: issue.description,
    color: issue.color || 0xff9800,
    fields: issue.fields || [],
  });
}

async function maybeSendIssueAlert(client, issueKey, issue) {
  const now = Date.now();
  const last = queries.getAlertThrottle(db, issueKey);
  if (last?.last_sent_at && now - Number(last.last_sent_at) < ISSUE_ALERT_THROTTLE_MS) {
    return false;
  }

  queries.setAlertThrottle(db, { key: issueKey, at: now });
  await sendIssueAlert(client, issue);
  return true;
}

async function resolveInactiveIssues(client, prefix, activeKeys, resolver) {
  const existing = queries.getAlertThrottleByPrefix(db, prefix);
  for (const row of existing) {
    if (activeKeys.has(row.key)) continue;
    const issue = resolver(row.key);
    if (!issue) {
      queries.deleteAlertThrottle(db, row.key);
      continue;
    }
    await sendIssueAlert(client, issue);
    queries.deleteAlertThrottle(db, row.key);
  }
}

async function runImpersonationHealthCheck(client) {
  if (!db) return;

  let guild;
  try {
    guild = await client.guilds.fetch(config.guildId);
  } catch (err) {
    log.warn("[impersonation] failed to fetch guild for health check.", err);
    return;
  }

  try {
    await guild.roles.fetch();
  } catch (err) {
    log.warn("[impersonation] failed to refresh role cache for health check.", err);
  }

  const activeRows = await refreshActiveProtectedPrincipalNames(guild);
  const activeIdSet = new Set(activeRows.map((row) => row.user_id));

  const missingPrefix = `impersonation_missing_protected_id:${guild.id}:`;
  const activeMissingKeys = new Set();
  const protectedRoleMembers = getProtectedRoleMembers(guild).filter(
    (member) => !member.user?.bot
  );
  for (const member of protectedRoleMembers) {
    if (activeIdSet.has(member.id)) continue;

    const issueKey = `${missingPrefix}${member.id}`;
    activeMissingKeys.add(issueKey);
    await maybeSendIssueAlert(client, issueKey, {
      warn: `[impersonation] protected-role member missing protected ID: ${member.user.tag} (${member.id})`,
      title: "Protected Role Missing ID Protection",
      description:
        "A protected-role member is not in the protected principals table.",
      color: 0xff9800,
      fields: [
        { name: "User", value: `<@${member.id}>`, inline: true },
        { name: "User ID", value: member.id, inline: true },
      ],
    });
  }
  await resolveInactiveIssues(client, missingPrefix, activeMissingKeys, (issueKey) => {
    const memberId = issueKey.slice(missingPrefix.length);
    if (!memberId) return null;
    return {
      warn: `[impersonation] resolved: protected-role member now has protected ID (${memberId})`,
      title: "Protected Role Coverage Resolved",
      description: "A protected-role member missing ID protection has been resolved.",
      color: 0x4caf50,
      fields: [{ name: "User ID", value: memberId, inline: true }],
    };
  });

  const activeAliasRows = queries.getActiveProtectedAliases(db, guild.id);
  const nameEntries = buildDuplicateNameEntries(activeRows, activeAliasRows);
  const duplicateMap = new Map();
  for (const entry of nameEntries) {
    const list = duplicateMap.get(entry.normalized) || [];
    list.push(entry);
    duplicateMap.set(entry.normalized, list);
  }

  const conflicts = Array.from(duplicateMap.entries()).filter(([, rows]) => {
    const uniqueUserIds = new Set(rows.map((row) => row.user_id));
    return uniqueUserIds.size > 1;
  });
  const singles = new Map(
    Array.from(duplicateMap.entries())
      .filter(([, rows]) => {
        const uniqueUserIds = new Set(rows.map((row) => row.user_id));
        return uniqueUserIds.size === 1;
      })
      .map(([normalizedName, rows]) => [normalizedName, getCanonicalProtectedRow(rows)])
  );

  const duplicatePrefix = `impersonation_duplicate_name:${guild.id}:`;
  const activeDuplicateKeys = new Set();

  if (conflicts.length > 0) {
    for (const [name, rows] of conflicts) {
      const canonical = getCanonicalProtectedRow(rows);
      const issueKey = `${duplicatePrefix}${name}`;
      activeDuplicateKeys.add(issueKey);
      const sent = await maybeSendIssueAlert(client, issueKey, {
        warn: `[impersonation] duplicate protected name detected: ${name}`,
        title: "Protected Name Conflict",
        description: "Multiple protected IDs currently share the same name.",
        color: 0xf44336,
        fields: [
          {
            name: "Protected Name",
            value: formatProtectedNameWithId(canonical, name),
            inline: true,
          },
          {
            name: "Users",
            value: Array.from(new Set(rows.map((row) => row.user_id)))
              .map((userId) => `<@${userId}> (${userId})`)
              .join("\n")
              .slice(0, 1024),
          },
        ],
      });

      if (sent) {
        await maybeSendThrottledDuplicateDm(guild, name, rows);
      }
    }
  }
  await resolveInactiveIssues(
    client,
    duplicatePrefix,
    activeDuplicateKeys,
    (issueKey) => {
      const name = issueKey.slice(duplicatePrefix.length);
      if (!name) return null;
      const single = singles.get(name) || null;
      return {
        warn: `[impersonation] resolved: duplicate protected name cleared (${name})`,
        title: "Protected Name Conflict Resolved",
        description: "A duplicate protected name conflict has been resolved.",
        color: 0x4caf50,
        fields: [
          {
            name: "Protected Name",
            value: formatProtectedNameWithId(single, name),
            inline: true,
          },
          {
            name: "User",
            value: formatProtectedNameWithId(single, name),
            inline: true,
          },
        ],
      };
    }
  );

  const activeDmKeys = new Set(
    Array.from(activeDuplicateKeys).map((issueKey) => {
      const name = issueKey.slice(duplicatePrefix.length);
      return `protected_name_conflict_dm:${guild.id}:${name}`;
    })
  );
  const existingDmThrottle = queries.getAlertThrottleByPrefix(
    db,
    `protected_name_conflict_dm:${guild.id}:`
  );
  for (const row of existingDmThrottle) {
    if (activeDmKeys.has(row.key)) continue;
    queries.deleteAlertThrottle(db, row.key);
  }
}

function startImpersonationHealthPoller(client) {
  if (impersonationHealthPoller) return impersonationHealthPoller;

  let running = false;
  const runCycle = async () => {
    if (running) return;
    running = true;
    try {
      await runImpersonationHealthCheck(client);
    } catch (err) {
      log.error("Impersonation health poller failed.", err);
    } finally {
      running = false;
    }
  };

  impersonationHealthPoller = setInterval(runCycle, IMPERSONATION_HEALTH_INTERVAL_MS);
  return impersonationHealthPoller;
}

function startPoller(client) {
  if (poller) return poller;

  let running = false;

  const runCycle = async () => {
    if (running) return;
    running = true;
    const now = Date.now();

    try {
      const due = await queries.getDuePending(db, now);
      for (const row of due) {
        await processDueRow(client, row);
      }
    } catch (err) {
      log.error("Verification poller failed.", err);
    } finally {
      running = false;
    }
  };

  poller = setInterval(runCycle, config.pollIntervalMs);
  runCycle();

  return poller;
}

async function processDueRow(client, row) {
  if (row.guild_id !== config.guildId) return;
  if (isVerificationSuppressed(row.user_id)) {
    log.debug(`[verify-poller] suppressed user=${row.user_id}`);
    return;
  }
  const current = queries.getState(db, {
    guildId: row.guild_id,
    userId: row.user_id,
  });
  if (current?.status && current.status !== "pending") {
    log.debug(
      `[verify-poller] skip status=${current.status} user=${row.user_id}`
    );
    return;
  }
  const now = Date.now();
  let guild;
  try {
    guild = await client.guilds.fetch(row.guild_id);
  } catch (err) {
    log.error(`Failed to fetch guild ${row.guild_id}.`, err);
    await queries.deferPending(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      nextDeadlineAt: now + config.pollIntervalMs,
      at: now,
    });
    return;
  }

  let member;
  try {
    member = await guild.members.fetch(row.user_id);
  } catch (err) {
    if (isUnknownMemberError(err)) {
      await queries.setLeft(db, {
        guildId: row.guild_id,
        userId: row.user_id,
        at: now,
      });
      await queries.logModeration(db, {
        guildId: row.guild_id,
        userId: row.user_id,
        action: "left",
        status: "closed",
        at: now,
      });
      log.info(`Member left before verification: ${row.user_id}`);
      return;
    }

    log.error(`Failed to fetch member ${row.user_id}.`, err);
    await queries.logModeration(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      action: "fetch_member",
      status: "error",
      error: err?.message || String(err),
      at: now,
    });
    await queries.deferPending(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      nextDeadlineAt: now + config.pollIntervalMs,
      at: now,
    });
    return;
  }

  log.debug(
    `[verify-poller] user=${row.user_id} status=${current?.status || "none"} ` +
      `fails=${row.verify_fails} deadline=${row.deadline_at} ` +
      `hasVerified=${hasRole(member, config.roleVerifiedId)} ` +
      `hasJailed=${hasRole(member, config.roleJailId)}`
  );

  if (hasRole(member, config.roleVerifiedId)) {
    await queries.setVerified(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      action: "verified",
      status: "success",
      at: now,
    });
    return;
  }

  if (hasRole(member, config.roleJailId)) {
    await queries.setJailed(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      action: "jailed",
      status: "skipped",
      at: now,
    });
    return;
  }

  if (isVerificationSuppressed(row.user_id)) return;
  const latest = queries.getState(db, {
    guildId: row.guild_id,
    userId: row.user_id,
  });
  if (latest?.status && latest.status !== "pending") {
    log.debug(
      `[verify-poller] late-skip status=${latest.status} user=${row.user_id}`
    );
    return;
  }

  if (row.verify_fails <= 0) {
    const reason = "Verification deadline missed (first failure).";
    try {
      log.info(
        `[verify-poller] kick user=${row.user_id} fails=${row.verify_fails} ` +
          `hasVerified=${hasRole(member, config.roleVerifiedId)} ` +
          `hasJailed=${hasRole(member, config.roleJailId)}`
      );
      await member.kick(reason);
      await queries.setKicked(db, {
        guildId: row.guild_id,
        userId: row.user_id,
        at: now,
        verifyFails: 1,
      });
      await queries.logModeration(db, {
        guildId: row.guild_id,
        userId: row.user_id,
        action: "kick",
        status: "success",
        details: reason,
        at: now,
      });
      await sendAdminLog(client, {
        title: "Liquidity Shield: Kick",
        description: `${member.user.tag} missed verification deadline.`,
        color: 0xffc107,
        fields: [
          { name: "User", value: `<@${row.user_id}>`, inline: true },
          { name: "User ID", value: row.user_id, inline: true },
          { name: "Fails", value: "1", inline: true },
        ],
      });
    } catch (err) {
      await handleActionError(client, row, "kick", err);
    }
    return;
  }

  const reason = "Verification deadline missed (second failure).";
  try {
    log.info(
      `[verify-poller] ban user=${row.user_id} fails=${row.verify_fails} ` +
        `hasVerified=${hasRole(member, config.roleVerifiedId)} ` +
        `hasJailed=${hasRole(member, config.roleJailId)}`
    );
    await guild.members.ban(row.user_id, { reason });
    await queries.setBanned(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      at: now,
      verifyFails: row.verify_fails + 1,
    });
    await queries.logModeration(db, {
      guildId: row.guild_id,
      userId: row.user_id,
      action: "ban",
      status: "success",
      details: reason,
      at: now,
    });
    await sendAdminLog(client, {
      title: "Liquidity Shield: Ban",
      description: `${member.user.tag} missed verification deadline twice.`,
      color: 0xe53935,
      fields: [
        { name: "User", value: `<@${row.user_id}>`, inline: true },
        { name: "User ID", value: row.user_id, inline: true },
        { name: "Fails", value: String(row.verify_fails + 1), inline: true },
      ],
    });
  } catch (err) {
    await handleActionError(client, row, "ban", err);
  }
}

async function handleActionError(client, row, action, err) {
  const now = Date.now();
  const message = err?.message || String(err);
  log.error(`Failed to ${action} ${row.user_id}.`, err);

  await queries.logModeration(db, {
    guildId: row.guild_id,
    userId: row.user_id,
    action,
    status: "error",
    error: message,
    at: now,
  });

  await sendAdminLog(client, {
    title: `Liquidity Shield: ${action} failed`,
    description: message,
    color: 0xff5722,
    fields: [{ name: "User ID", value: row.user_id, inline: true }],
  });

  await queries.deferPending(db, {
    guildId: row.guild_id,
    userId: row.user_id,
    nextDeadlineAt: now + config.pollIntervalMs,
    at: now,
  });
}

async function intermentMemberImpl(member, actorTag) {
  await member.roles.set([config.roleJailId], "Automated interment.");
  const now = Date.now();
  await queries.setJailed(db, {
    guildId: member.guild.id,
    userId: member.id,
    at: now,
  });
  await queries.logModeration(db, {
    guildId: member.guild.id,
    userId: member.id,
    action: "interment",
    status: "success",
    details: actorTag ? `actor=${actorTag}` : null,
    at: now,
  });
}

async function runProtectSweep(guild, protectedRow, actorTag) {
  const protectedName = protectedRow?.current_name || "";
  const normalizedProtectedName = normalizeName(protectedName);
  if (!normalizedProtectedName) return [];

  const activeRows = queries.getActiveProtectedPrincipals(db, guild.id);
  const protectedIds = new Set(activeRows.map((row) => row.user_id));
  const swept = [];

  if (guild.members.cache.size < guild.memberCount) {
    log.debug(
      `[protect-sweep] cache-only scan ${guild.members.cache.size}/${guild.memberCount} members`
    );
  }

  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (member.id === protectedRow.user_id) continue;
    if (protectedIds.has(member.id)) continue;
    if (member.roles.cache.has(config.roleJailId)) continue;

    const currentName = getMemberCheckName(member);
    if (normalizeName(currentName) !== normalizedProtectedName) continue;

    await intermentMemberImpl(member, actorTag ? `${actorTag}:protect-sweep` : "protect-sweep");
    swept.push({
      userId: member.id,
      tag: member.user?.tag || member.id,
      name: currentName || "(none)",
    });
  }

  return swept;
}

module.exports = {
  initVerificationGate,
  handleMemberAdd,
  handleMemberUpdate,
  suppressVerification,
  getProtectedNameSet,
  isImpersonation,
  runImpersonationHealthCheck,
  intermentMember: async (member, actorTag) => {
    if (!db) throw new Error("DB not initialized");
    await intermentMemberImpl(member, actorTag);
  },
  clearRulesReactionById: async (guild, userId) => {
    if (!db) throw new Error("DB not initialized");
    const rulesConfig = queries.getRulesMessage(db, { guildId: guild.id });
    if (!rulesConfig) return;

    let channel;
    try {
      channel = await guild.client.channels.fetch(rulesConfig.channel_id);
    } catch {
      return;
    }
    if (!channel || !channel.isTextBased()) return;

    let message;
    try {
      message = await channel.messages.fetch(rulesConfig.message_id);
    } catch {
      return;
    }

    const reaction = message.reactions.cache.find(
      (r) => r.emoji?.name === config.rulesEmoji
    );
    if (!reaction) return;

    try {
      const users = await reaction.users.fetch();
      if (!users.has(userId)) return;
      await reaction.users.remove(userId);
    } catch {
      // ignore failures
    }
  },
  resetFailsForUser: async (guildId, userId, actorTag) => {
    if (!db) throw new Error("DB not initialized");

    const now = Date.now();
    const changes = queries.resetFails(db, { guildId, userId, at: now });
    await queries.logModeration(db, {
      guildId,
      userId,
      action: "reset_fails",
      status: changes ? "success" : "nochange",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });
    return changes;
  },
  getRulesConfig: (guildId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.getRulesMessage(db, { guildId });
  },
  setRulesConfig: (guildId, channelId, messageId) => {
    if (!db) throw new Error("DB not initialized");
    const now = Date.now();
    queries.setRulesMessage(db, {
      guildId,
      channelId,
      messageId,
      at: now,
    });
  },
  getFaqConfig: (guildId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.getFaqMessage(db, { guildId });
  },
  setFaqConfig: (guildId, channelId, messageId) => {
    if (!db) throw new Error("DB not initialized");
    const now = Date.now();
    queries.setFaqMessage(db, {
      guildId,
      channelId,
      messageId,
      at: now,
    });
  },
  getQuickStartConfig: (guildId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.getQuickStartMessage(db, { guildId });
  },
  setQuickStartConfig: (guildId, channelId, messageIds) => {
    if (!db) throw new Error("DB not initialized");
    const now = Date.now();
    queries.setQuickStartMessage(db, {
      guildId,
      channelId,
      messageIds,
      at: now,
    });
  },
  setJailedForUser: async (guildId, userId, actorTag) => {
    if (!db) throw new Error("DB not initialized");

    const now = Date.now();
    queries.setJailed(db, { guildId, userId, at: now });
    await queries.logModeration(db, {
      guildId,
      userId,
      action: "jailed",
      status: "success",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });
  },
  protectPrincipal: async (guild, userId, actorTag, notes) => {
    if (!db) throw new Error("DB not initialized");

    const now = Date.now();
    const currentName = await fetchCurrentProtectedName(guild, userId);
    queries.upsertProtectedPrincipal(db, {
      guildId: guild.id,
      userId,
      currentName: currentName || null,
      active: 1,
      addedBy: actorTag || null,
      notes: notes || null,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: guild.id,
      userId,
      action: "protect_principal",
      status: "success",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });
    const protectedRow = queries.getProtectedPrincipal(db, {
      guildId: guild.id,
      userId,
    });
    const swept = await runProtectSweep(guild, protectedRow, actorTag);
    if (swept.length > 0) {
      await sendAdminLog(guild.client, {
        title: "Protection Sweep Interment",
        description:
          "Non-protected users already using a newly protected name were interred.",
        color: 0xff5722,
        fields: [
          {
            name: "Protected Name",
            value: `${protectedRow?.current_name || "(none)"} (${userId})`,
            inline: true,
          },
          {
            name: "Users",
            value: swept
              .map((row) => `<@${row.userId}> (${row.userId})`)
              .join("\n")
              .slice(0, 1024),
          },
        ],
      });
      log.warn(
        `[protect-sweep] interred ${swept.length} user(s) for protected name "${protectedRow?.current_name || "(none)"}"`
      );
    }
    await runImpersonationHealthCheck(guild.client);
    return { row: protectedRow, swept };
  },
  protectAlias: async (guild, userId, aliasName, actorTag, notes) => {
    if (!db) throw new Error("DB not initialized");

    const normalizedAlias = String(aliasName || "").trim();
    if (!normalizedAlias) {
      throw new Error("Alias name is required.");
    }

    const principal = queries.getProtectedPrincipal(db, {
      guildId: guild.id,
      userId,
    });
    if (!principal || !principal.active) {
      throw new Error("Protect the user ID first with !protect before adding aliases.");
    }

    const now = Date.now();
    queries.upsertProtectedAlias(db, {
      guildId: guild.id,
      userId,
      aliasName: normalizedAlias,
      active: 1,
      addedBy: actorTag || null,
      notes: notes || null,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: guild.id,
      userId,
      action: "protect_alias",
      status: "success",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });

    const swept = await runProtectSweep(
      guild,
      { user_id: userId, current_name: normalizedAlias },
      actorTag
    );
    if (swept.length > 0) {
      await sendAdminLog(guild.client, {
        title: "Protection Sweep Interment",
        description:
          "Non-protected users already using a newly protected alias were interred.",
        color: 0xff5722,
        fields: [
          {
            name: "Protected Name",
            value: `${normalizedAlias} (${userId})`,
            inline: true,
          },
          {
            name: "Users",
            value: swept
              .map((row) => `<@${row.userId}> (${row.userId})`)
              .join("\n")
              .slice(0, 1024),
          },
        ],
      });
      log.warn(
        `[protect-sweep] interred ${swept.length} user(s) for protected alias "${normalizedAlias}"`
      );
    }

    await runImpersonationHealthCheck(guild.client);
    return {
      row: queries.getProtectedAlias(db, {
        guildId: guild.id,
        userId,
        aliasName: normalizedAlias,
      }),
      swept,
    };
  },
  unprotectPrincipal: async (guild, userId, actorTag, notes) => {
    if (!db) throw new Error("DB not initialized");

    const now = Date.now();
    const existing = queries.getProtectedPrincipal(db, {
      guildId: guild.id,
      userId,
    });
    queries.upsertProtectedPrincipal(db, {
      guildId: guild.id,
      userId,
      currentName: existing?.current_name || null,
      active: 0,
      addedBy: actorTag || null,
      notes: notes || null,
      at: now,
    });
    await queries.logModeration(db, {
      guildId: guild.id,
      userId,
      action: "unprotect_principal",
      status: "success",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });
    await runImpersonationHealthCheck(guild.client);
    return queries.getProtectedPrincipal(db, { guildId: guild.id, userId });
  },
  unprotectAlias: async (guild, userId, aliasName, actorTag, notes) => {
    if (!db) throw new Error("DB not initialized");

    const normalizedAlias = String(aliasName || "").trim();
    if (!normalizedAlias) {
      throw new Error("Alias name is required.");
    }

    const result = queries.deleteProtectedAlias(db, {
      guildId: guild.id,
      userId,
      aliasName: normalizedAlias,
    });
    const now = Date.now();
    await queries.logModeration(db, {
      guildId: guild.id,
      userId,
      action: "unprotect_alias",
      status: result?.changes > 0 ? "success" : "nochange",
      details:
        (actorTag ? `actor=${actorTag};` : "") + `alias=${normalizedAlias}`,
      at: now,
    });
    await runImpersonationHealthCheck(guild.client);
    return result?.changes || 0;
  },
  unprotectAllAliasesForUser: async (guild, userId, actorTag, notes) => {
    if (!db) throw new Error("DB not initialized");

    const now = Date.now();
    const result = queries.deleteProtectedAliasesForUser(db, {
      guildId: guild.id,
      userId,
    });
    await queries.logModeration(db, {
      guildId: guild.id,
      userId,
      action: "unprotect_aliases_all",
      status: result?.changes > 0 ? "success" : "nochange",
      details: actorTag ? `actor=${actorTag}` : null,
      at: now,
    });
    await runImpersonationHealthCheck(guild.client);
    return result?.changes || 0;
  },
  listProtectedPrincipals: async (guildId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.getProtectedPrincipals(db, guildId);
  },
  listProtectedAliases: async (guildId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.getProtectedAliases(db, guildId);
  },
  isProtectedPrincipalId: async (guildId, userId) => {
    if (!db) throw new Error("DB not initialized");
    return queries.isActiveProtectedPrincipal(db, { guildId, userId });
  },
};
