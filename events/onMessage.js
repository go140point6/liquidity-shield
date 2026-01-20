// ./events/onMessage.js

const { PermissionFlagsBits } = require("discord.js");
const path = require("node:path");
const { config } = require("../config/botConfig");
const { rulesText } = require("../config/rulesText");
const { faqText } = require("../config/faqText");
const { quickStartBlocks } = require("../config/quickStartContent");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const {
  resetFailsForUser,
  getRulesConfig,
  setRulesConfig,
  getFaqConfig,
  setFaqConfig,
  getQuickStartConfig,
  setQuickStartConfig,
  setJailedForUser,
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

    try {
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

    try {
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

  if (command === "!punish" || command === "!jail") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await message.reply("Usage: `!punish <userId|@mention>`");
      return;
    }

    let target;
    try {
      target = await message.guild.members.fetch(userId);
    } catch (err) {
      log.warn(`Failed to fetch member ${userId} for jail.`, err);
      await message.reply("❌ User not found in this server.");
      return;
    }

    try {
      await target.roles.set([config.roleJailId], "Manual punish command.");
      await setJailedForUser(message.guild.id, userId, message.author?.tag);
      await message.reply(`✅ ${target.user.tag} punished.`);

      await sendAdminLog(message.client, {
        title: "Liquidity Shield: Manual Punish",
        description: `Punished by ${message.author.tag}`,
        color: 0xff9800,
        fields: [{ name: "User ID", value: userId, inline: true }],
      });
    } catch (err) {
      log.error("jail command failed.", err);
      await message.reply("❌ Failed to jail user. Check logs.");
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

  if (command === "!promote" || command === "!demote") {
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
      await message.reply(
        `✅ ${member.user.tag} now has only ${targetRole.name}.`
      );
    } catch (err) {
      log.error(`${command} command failed.`, err);
      await message.reply("❌ Failed to update roles. Check logs.");
    }
  }

  if (command === "!help") {
    const lines = [
      "**Liquidity Shield Commands**",
      "",
      "`!copychannelperms` — Copy channel overwrites from one role to another.",
      "`!copyroleperms` — Copy base permissions from one role to another.",
      "`!postfaq` — Post the FAQ and save its message ID.",
      "`!editfaq` — Edit the stored FAQ post.",
      "`!postqs` — Post the quick-start message set.",
      "`!editqs` — Re-post the quick-start messages.",
      "`!postrules` — Post the rules and save its message ID.",
      "`!editrules` — Edit the stored rules post.",
      "`!promote` — Set a user's role to one target role (humans only).",
      "`!demote` — Set a user's role to one target role (humans only).",
      "`!punish` — Strip roles and assign Penitent.",
      "`!resetfails` — Reset a user's verification fail count.",
    ];

    await message.reply(lines.join("\n"));
  }

  if (command === "!postqs") {
    if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("❌ You do not have permission to use this command.");
      return;
    }

    try {
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
