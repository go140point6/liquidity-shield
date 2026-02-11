// ./events/onMessage.js

const { PermissionFlagsBits } = require("discord.js");
const path = require("node:path");
const { config } = require("../config/botConfig");
const { rulesText } = require("../config/rulesText");
const { faqText } = require("../config/faqText");
const { quickStartBlocks } = require("../config/quickStartContent");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { setMessage, getRecentMessagesByAuthor } = require("../utils/messageCache");
const { suppressBulkForUser } = require("../utils/modLogSuppress");
const { suppressVerification, intermentMember } = require("../services/verificationGate");
const { getDb } = require("../db/db");
const { setStatus } = require("../db/queries");
const {
  resetFailsForUser,
  getRulesConfig,
  setRulesConfig,
  getFaqConfig,
  setFaqConfig,
  getQuickStartConfig,
  setQuickStartConfig,
  setJailedForUser,
  protectPrincipal,
  unprotectPrincipal,
  listProtectedPrincipals,
} = require("../services/verificationGate");

function extractUserId(token) {
  if (!token) return null;
  const match = token.match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(token)) return token;
  return null;
}

function extractRoleId(token) {
  if (!token) return null;
  const match = token.match(/^<@&(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(token)) return token;
  return null;
}

function extractChannelId(token) {
  if (!token) return null;
  const match = token.match(/^<#(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(token)) return token;
  return null;
}

function overwritesMatch(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.allow.bitfield === b.allow.bitfield && a.deny.bitfield === b.deny.bitfield
  );
}

async function onMessage(message) {
  if (message.author?.bot) return;
  if (!message.guild) return;

  setMessage(message);

  const content = message.content?.trim();
  if (!content || !content.startsWith("!")) return;

  const [command, ...args] = content.split(/\s+/);

  if (command === "!resetfails" || command === "!clearfails") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.BanMembers)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!resetfails <userId|@mention>`");
      return;
    }

    try {
      const changes = await resetFailsForUser(
        message.guild.id,
        userId,
        message.author?.tag
      );
      if (changes) {
        await message.reply(`✅ Cleared verification fails for ${userId}.`);
        await sendAdminLog(message.client, {
          title: "Liquidity Shield: Reset Fails",
          description: `Fails reset by ${message.author.tag}`,
          color: 0x4caf50,
          fields: [{ name: "User ID", value: userId, inline: true }],
        });
      } else {
        await message.reply(`ℹ️ No record found for ${userId}.`);
      }
    } catch (err) {
      log.error("resetfails command failed.", err);
      await message.reply("❌ Failed to reset fails. Check logs.");
    }
  }

  if (command === "!postrules") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const force = args[0]?.toLowerCase() === "force";

    try {
      const existing = getRulesConfig(message.guild.id);
      if (existing && !force) {
        await message.reply(
          "ℹ️ Rules post already exists. Use `!editrules` or `!postrules force`."
        );
        return;
      }

      const channel = await message.client.channels.fetch(config.rulesChannelId);
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ Rules channel is missing or not text-based.");
        return;
      }

      const posted = await channel.send(rulesText);
      try {
        await posted.react(config.rulesEmoji);
      } catch (err) {
        log.warn("Failed to add rules reaction.", err);
      }

      setRulesConfig(message.guild.id, channel.id, posted.id);
      await message.reply(`✅ Rules posted in <#${channel.id}>.`);

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Rules Posted",
        description: `Posted by ${message.author.tag}`,
        color: 0x4caf50,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("postrules command failed.", err);
      await message.reply("❌ Failed to post rules. Check logs.");
    }
  }

  if (command === "!editrules") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    try {
      const existing = getRulesConfig(message.guild.id);
      if (!existing) {
        await message.reply("ℹ️ No stored rules message. Use `!postrules` first.");
        return;
      }

      const channel = await message.client.channels.fetch(existing.channel_id);
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ Rules channel is missing or not text-based.");
        return;
      }

      const msg = await channel.messages.fetch(existing.message_id);
      await msg.edit(rulesText);
      log.debug(`Rules updated by ${message.author.tag} in ${channel.id}`);
      await message.reply("✅ Rules message updated.");

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Rules Edited",
        description: `Edited by ${message.author.tag}`,
        color: 0x2196f3,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("editrules command failed.", err);
      await message.reply("❌ Failed to edit rules. Check logs.");
    }
  }

  if (command === "!postfaq") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const force = args[0]?.toLowerCase() === "force";

    try {
      const existing = getFaqConfig(message.guild.id);
      if (existing && !force) {
        await message.reply(
          "ℹ️ FAQ post already exists. Use `!editfaq` or `!postfaq force`."
        );
        return;
      }

      const channel = await message.client.channels.fetch(config.faqChannelId);
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ FAQ channel is missing or not text-based.");
        return;
      }

      const posted = await channel.send(faqText);
      setFaqConfig(message.guild.id, channel.id, posted.id);
      await message.reply(`✅ FAQ posted in <#${channel.id}>.`);

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: FAQ Posted",
        description: `Posted by ${message.author.tag}`,
        color: 0x4caf50,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("postfaq command failed.", err);
      await message.reply("❌ Failed to post FAQ. Check logs.");
    }
  }

  if (command === "!editfaq") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    try {
      const existing = getFaqConfig(message.guild.id);
      if (!existing) {
        await message.reply("ℹ️ No stored FAQ message. Use `!postfaq` first.");
        return;
      }

      const channel = await message.client.channels.fetch(existing.channel_id);
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ FAQ channel is missing or not text-based.");
        return;
      }

      const msg = await channel.messages.fetch(existing.message_id);
      await msg.edit(faqText);
      log.debug(`FAQ updated by ${message.author.tag} in ${channel.id}`);
      await message.reply("✅ FAQ message updated.");

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: FAQ Edited",
        description: `Edited by ${message.author.tag}`,
        color: 0x2196f3,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("editfaq command failed.", err);
      await message.reply("❌ Failed to edit FAQ. Check logs.");
    }
  }

  if (command === "!interment") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!interment <userId|@mention>`");
      return;
    }

    let target;
    try {
      target = await message.guild.members.fetch(userId);
    } catch (err) {
      log.warn(`Failed to fetch member ${userId} for interment.`, err);
      await message.reply("❌ User not found in this server.");
      return;
    }

    try {
      await intermentMember(target, message.author?.tag);
      await message.reply(`🔒 <@${userId}> has been placed in interment.`);

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Manual Interment",
        description: `Interment by ${message.author.tag}`,
        color: 0xff9800,
        fields: [
          { name: "User", value: `${target.user.tag} (<@${userId}>)`, inline: true },
          { name: "User ID", value: userId, inline: true },
        ],
      });
    } catch (err) {
      log.error("interment command failed.", err);
      await message.reply("❌ Failed to place user in interment. Check logs.");
    }
  }

  if (command === "!copyroleperms") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const sourceRoleId = extractRoleId(args[0]);
    const targetRoleId = extractRoleId(args[1]);
    if (!sourceRoleId || !targetRoleId) {
      await message.reply("Usage: `!copyroleperms @source @target`");
      return;
    }

    const sourceRole = message.guild.roles.cache.get(sourceRoleId);
    const targetRole = message.guild.roles.cache.get(targetRoleId);
    if (!sourceRole || !targetRole) {
      await message.reply("❌ Role not found in this server.");
      return;
    }

    try {
      await targetRole.setPermissions(
        sourceRole.permissions,
        `Copied permissions from ${sourceRole.name}`
      );
      await message.reply(
        `✅ Copied permissions from ${sourceRole.name} to ${targetRole.name}.`
      );
    } catch (err) {
      log.error("copyroleperms command failed.", err);
      await message.reply("❌ Failed to copy role permissions. Check logs.");
    }
  }

  if (command === "!copychannelperms") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const channelId = extractChannelId(args[0]);
    const sourceRoleId = extractRoleId(args[1]);
    const targetRoleId = extractRoleId(args[2]);
    if (!channelId || !sourceRoleId || !targetRoleId) {
      await message.reply("Usage: `!copychannelperms #channel @source @target`");
      return;
    }

    const channel = message.guild.channels.cache.get(channelId);
    const sourceRole = message.guild.roles.cache.get(sourceRoleId);
    const targetRole = message.guild.roles.cache.get(targetRoleId);
    if (!channel || !sourceRole || !targetRole) {
      await message.reply("❌ Channel/category or role not found in this server.");
      return;
    }

    try {
      if (channel.type === 4) {
        const categorySource =
          channel.permissionOverwrites.cache.get(sourceRole.id) || null;
        const children = message.guild.channels.cache.filter(
          (child) => child.parentId === channel.id
        );

        let updated = 0;
        let skipped = 0;

        for (const child of children.values()) {
          const childSource =
            child.permissionOverwrites.cache.get(sourceRole.id) || null;
          if (!overwritesMatch(categorySource, childSource)) {
            skipped += 1;
            continue;
          }

          const childTarget =
            child.permissionOverwrites.cache.get(targetRole.id) || null;

          if (!categorySource) {
            if (childTarget) {
              await child.permissionOverwrites.delete(
                targetRole.id,
                `Cleared overwrite (copied from ${sourceRole.name})`
              );
            }
            updated += 1;
            continue;
          }

          await child.permissionOverwrites.edit(
            targetRole,
            {
              allow: categorySource.allow.bitfield,
              deny: categorySource.deny.bitfield,
            },
            { reason: `Copied channel overwrites from ${sourceRole.name}` }
          );
          updated += 1;
        }

        await message.reply(
          `✅ Category sync complete. Updated ${updated} channel(s), skipped ${skipped} (not in sync).`
        );
        return;
      }

      if (!channel.isTextBased()) {
        await message.reply("❌ Channel is not text-based.");
        return;
      }

      const sourceOverwrite =
        channel.permissionOverwrites.cache.get(sourceRole.id) || null;
      const targetOverwrite =
        channel.permissionOverwrites.cache.get(targetRole.id) || null;

      if (!sourceOverwrite) {
        if (targetOverwrite) {
          await channel.permissionOverwrites.delete(
            targetRole.id,
            `Cleared overwrite (copied from ${sourceRole.name})`
          );
        }
        await message.reply(
          `✅ Cleared ${targetRole.name} overwrite on ${channel.name} (source had none).`
        );
        return;
      }

      await channel.permissionOverwrites.edit(
        targetRole,
        {
          allow: sourceOverwrite.allow.bitfield,
          deny: sourceOverwrite.deny.bitfield,
        },
        { reason: `Copied channel overwrites from ${sourceRole.name}` }
      );

      await message.reply(
        `✅ Copied ${sourceRole.name} overwrites to ${targetRole.name} on ${channel.name}.`
      );
    } catch (err) {
      log.error("copychannelperms command failed.", err);
      await message.reply("❌ Failed to copy channel overwrites. Check logs.");
    }
  }

  if (
    command === "!elevate" ||
    command === "!promote" ||
    command === "!reassign" ||
    command === "!demote"
  ) {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    const roleId = extractRoleId(args[1]);
    if (!userId || !roleId) {
      await message.reply(`Usage: \`${command} @user @role\``);
      return;
    }

    let member;
    try {
      member = await message.guild.members.fetch(userId);
    } catch (err) {
      log.warn(`Failed to fetch member ${userId} for ${command}.`, err);
      await message.reply("❌ User not found in this server.");
      return;
    }

    if (member.user?.bot) {
      await message.reply("❌ This command is for human users only.");
      return;
    }

    const targetRole = message.guild.roles.cache.get(roleId);
    if (!targetRole) {
      await message.reply("❌ Role not found in this server.");
      return;
    }

    if (!targetRole.editable) {
      await message.reply("❌ I cannot assign that role (check role hierarchy).");
      return;
    }

    const managedRoles = member.roles.cache
      .filter((role) => role.managed)
      .map((role) => role.id);

    const desiredRoles = [...managedRoles, targetRole.id];
    try {
      await member.roles.set(desiredRoles, `${command} command.`);
      if (command === "!elevate" || command === "!promote") {
        await message.reply(`🔼 <@${userId}> has been elevated to <@&${roleId}>.`);
      } else {
        await message.reply(`🔽 <@${userId}> has been reassigned to <@&${roleId}>.`);
      }
    } catch (err) {
      log.error(`${command} command failed.`, err);
      await message.reply("❌ Failed to update roles. Check logs.");
    }
  }

  if (command === "!protect") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!protect <userId|@mention> [notes]`");
      return;
    }

    const notes = args.slice(1).join(" ").trim() || null;
    try {
      const { row, swept } = await protectPrincipal(
        message.guild,
        userId,
        message.author?.tag,
        notes
      );
      let reply = 
        `✅ Protected ID added: <@${userId}> (${userId})` +
        `${row?.current_name ? ` name="${row.current_name}"` : ""}`;
      if (Array.isArray(swept) && swept.length > 0) {
        reply += `\n⚠️ Protection sweep interred ${swept.length} matching user(s).`;
      }
      await message.reply(reply);
    } catch (err) {
      log.error("protect command failed.", err);
      await message.reply("❌ Failed to protect user ID. Check logs.");
    }
  }

  if (command === "!unprotect") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!unprotect <userId|@mention> [notes]`");
      return;
    }

    const notes = args.slice(1).join(" ").trim() || null;
    try {
      await unprotectPrincipal(message.guild, userId, message.author?.tag, notes);
      await message.reply(`✅ Protected ID disabled: <@${userId}> (${userId})`);
    } catch (err) {
      log.error("unprotect command failed.", err);
      await message.reply("❌ Failed to unprotect user ID. Check logs.");
    }
  }

  if (command === "!protected") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    try {
      const rows = await listProtectedPrincipals(message.guild.id);
      if (!rows.length) {
        await message.reply("ℹ️ No protected IDs found.");
        return;
      }

      const lines = rows.map((row) => {
        const status = row.active ? "ACTIVE" : "INACTIVE";
        const name = row.current_name || "(none)";
        const addedBy = row.added_by || "(unknown)";
        const notes = row.notes || "(none)";
        return `• ${status} | ${row.user_id} | name="${name}" | by="${addedBy}" | notes="${notes}"`;
      });

      const chunks = [];
      let current = "**Protected IDs**\n";
      for (const line of lines) {
        if ((current + line + "\n").length > 1900) {
          chunks.push(current);
          current = "";
        }
        current += `${line}\n`;
      }
      if (current.trim()) chunks.push(current);

      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } catch (err) {
      log.error("protected command failed.", err);
      await message.reply("❌ Failed to list protected IDs. Check logs.");
    }
  }

  if (command === "!help") {
    const lines = [
      "**Liquidity Shield Commands**",
      "",
      "__Content Setup__",
      "`!postrules` — Post the rules and save its message ID.",
      "`!editrules` — Edit the stored rules post.",
      "`!postfaq` — Post the FAQ and save its message ID.",
      "`!editfaq` — Edit the stored FAQ post.",
      "`!postqs` — Post the quick-start message set.",
      "`!editqs` — Re-post the quick-start messages.",
      "",
      "__Permission Copying__",
      "`!copychannelperms` — Copy channel overwrites from one role to another.",
      "`!copyroleperms` — Copy base permissions from one role to another.",
      "",
      "__Role Actions__",
      "`!elevate` — Set a user's role to one target role (humans only).",
      "`!reassign` — Set a user's role to one target role (humans only).",
      "`!interment` — Strip roles and assign Penitent.",
      "",
      "__Protection__",
      "`!protect` — Add or reactivate a protected ID.",
      "`!unprotect` — Deactivate a protected ID.",
      "`!protected` — List active/inactive protected IDs and metadata.",
      "",
      "__Moderation__",
      "`!ban` — Ban a user and delete 7 days of messages (or use `save`).",
      "`!resetfails` — Reset a user's verification fail count.",
      "",
      "__General__",
      "`!help` — Show this command list.",
    ];

    await message.reply(lines.join("\n"));
  }

  if (command === "!postqs") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const force = args[0]?.toLowerCase() === "force";

    try {
      const existing = getQuickStartConfig(message.guild.id);
      if (existing && !force) {
        await message.reply(
          "ℹ️ Quick-start post already exists. Use `!editqs` or `!postqs force`."
        );
        return;
      }

      const channel = await message.client.channels.fetch(
        config.quickStartChannelId
      );
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ Quick-start channel is missing or not text-based.");
        return;
      }

      const messageIds = await postQuickStart(channel);
      setQuickStartConfig(message.guild.id, channel.id, JSON.stringify(messageIds));
      await message.reply(`✅ Quick-start posted in <#${channel.id}>.`);

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Quick-Start Posted",
        description: `Posted by ${message.author.tag}`,
        color: 0x4caf50,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("postqs command failed.", err);
      await message.reply("❌ Failed to post quick-start. Check logs.");
    }
  }

  if (command === "!ban") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.BanMembers)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!ban <userId|@mention> [save]`");
      return;
    }

    const save = args[1]?.toLowerCase() === "save";
    const deleteSeconds = save ? 0 : 7 * 24 * 60 * 60;

    let targetTag = "Unknown";
    try {
      const member = await message.guild.members.fetch(userId);
      targetTag = member.user.tag;
    } catch {
      // ignore; user might not be in guild
    }

    try {
      log.info(
        `[ban] requested by ${message.author.tag} target=${userId} save=${save}`
      );
      suppressVerification(userId, 120000);
      const db = getDb();
      if (db) {
        setStatus(db, {
          guildId: message.guild.id,
          userId,
          status: "banned",
          at: Date.now(),
        });
      }

      await message.guild.members.ban(userId, {
        reason: `Manual ban by ${message.author.tag}`,
        deleteMessageSeconds: deleteSeconds,
      });

      if (!save) {
        suppressBulkForUser(userId);
      }

      await message.reply(
        save
          ? `✅ Banned ${targetTag} without deleting messages.`
          : `✅ Banned ${targetTag} and deleted up to 7 days of messages.`
      );

      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const samples = getRecentMessagesByAuthor(userId, since, 50);
      if (samples.length > 0) {
        const { lines, attachmentUrls } = buildBanEvidence(samples);

      await sendAdminLog(message.client, {
        title: "Ban Evidence (Cached)",
        description: `Recent cached messages for ${targetTag}`,
        color: 0x6d4c41,
        fields: [
          { name: "Samples", value: lines.slice(0, 10).join("\n") },
          attachmentUrls.length
            ? {
                name: "Attachment URLs",
                value: attachmentUrls.slice(0, 10).join("\n"),
              }
            : null,
        ].filter(Boolean),
      });
      }
    } catch (err) {
      log.error("ban command failed.", err);
      await message.reply("❌ Failed to ban user. Check logs.");
    }
  }

  if (command === "!editqs") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    try {
      const existing = getQuickStartConfig(message.guild.id);
      if (!existing) {
        await message.reply("ℹ️ No stored quick-start. Use `!postqs` first.");
        return;
      }

      const channel = await message.client.channels.fetch(existing.channel_id);
      if (!channel || !channel.isTextBased()) {
        await message.reply("❌ Quick-start channel is missing or not text-based.");
        return;
      }

      const messageIds = safeParseJsonArray(existing.message_ids);
      for (const id of messageIds) {
        try {
          const msg = await channel.messages.fetch(id);
          await msg.delete();
        } catch {
          // ignore missing messages
        }
      }

      const newMessageIds = await postQuickStart(channel);
      setQuickStartConfig(
        message.guild.id,
        channel.id,
        JSON.stringify(newMessageIds)
      );
      log.debug(`Quick-start updated by ${message.author.tag} in ${channel.id}`);
      await message.reply("✅ Quick-start re-posted.");

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Quick-Start Edited",
        description: `Edited by ${message.author.tag}`,
        color: 0x2196f3,
        fields: [{ name: "Channel", value: `<#${channel.id}>`, inline: true }],
      });
    } catch (err) {
      log.error("editqs command failed.", err);
      await message.reply("❌ Failed to edit quick-start. Check logs.");
    }
  }
}

function buildBanEvidence(samples) {
  const seenContent = new Set();
  const seenUrls = new Set();
  const lines = [];
  const attachmentUrls = [];

  for (const m of samples) {
    const content = (m.content || "").trim();
    const key = content.toLowerCase();
    const label = content ? content.slice(0, 160) : "(no content)";
    const attachments = Array.isArray(m.attachments) ? m.attachments : [];

    if (!seenContent.has(key)) {
      seenContent.add(key);
      lines.push(`• <#${m.channelId}> — ${label}`);
    }

    for (const url of attachments) {
      const filename = extractFilename(url);
      const fileKey = filename.toLowerCase();
      if (seenUrls.has(fileKey)) continue;
      seenUrls.add(fileKey);
      attachmentUrls.push(url);
    }

    if (lines.length >= 25 && attachmentUrls.length >= 25) break;
  }

  return { lines, attachmentUrls };
}

function extractFilename(url) {
  if (!url) return "";
  const base = url.split("?")[0];
  const parts = base.split("/");
  return parts[parts.length - 1] || url;
}

function safeParseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function postQuickStart(channel) {
  const messageIds = [];

  for (const block of quickStartBlocks) {
    if (block.type === "text") {
      const msg = await channel.send(block.content);
      messageIds.push(msg.id);
      continue;
    }

    if (block.type === "images") {
      const files = block.files.map((file) => ({
        attachment: path.join(__dirname, "..", "img", file),
        name: file,
      }));
      const msg = await channel.send({ files });
      messageIds.push(msg.id);
    }
  }

  return messageIds;
}

module.exports = { onMessage };
