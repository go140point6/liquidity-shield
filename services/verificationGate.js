// ./services/verificationGate.js
const { config } = require("../config/botConfig");
const { welcomeMessages } = require("../config/welcomeMessages");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { openDb } = require("../db/db");
const queries = require("../db/queries");

let db = null;
let poller = null;

function hasRole(member, roleId) {
  return member?.roles?.cache?.has(roleId);
}

function isUnknownMemberError(err) {
  return err && (err.code === 10007 || err.code === 10013);
}

async function initVerificationGate(client) {
  db = await openDb(config.dbPath);
  await queries.initSchema(db);
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

  if (row.verify_fails <= 0) {
    const reason = "Verification deadline missed (first failure).";
    try {
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

module.exports = {
  initVerificationGate,
  handleMemberAdd,
  handleMemberUpdate,
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
};
