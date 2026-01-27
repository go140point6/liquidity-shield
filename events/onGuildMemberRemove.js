// ./events/onGuildMemberRemove.js
const { AuditLogEvent } = require("discord.js");
const { config } = require("../config/botConfig");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { suppressVerification, clearRulesReactionById } = require("../services/verificationGate");
const { getDb } = require("../db/db");
const { setStatus } = require("../db/queries");

async function onGuildMemberRemove(member) {
  try {
    const { guild, user } = member;
    let action = "left";
    let executorTag = "Unknown";
    let reason = "Unknown";
    const now = Date.now();

    try {
      const banLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 5,
      });
      const banEntry = banLogs.entries.find(
        (logEntry) =>
          logEntry.target?.id === user.id &&
          now - logEntry.createdTimestamp < 20000
      );
      if (banEntry) {
        return;
      }
    } catch (err) {
      log.warn("Failed to fetch audit log for ban.", err);
    }

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 5,
      });
      const entry = logs.entries.find(
        (logEntry) =>
          logEntry.target?.id === user.id &&
          now - logEntry.createdTimestamp < 20000
      );
      if (entry) {
        action = "kicked";
        executorTag = entry.executor?.tag || executorTag;
        reason = entry.reason || reason;
      }
    } catch (err) {
      log.warn("Failed to fetch audit log for kick.", err);
    }

    if (action === "kicked") {
      log.info(`[kick] ${user.tag} kicked by ${executorTag}`);
      await sendAdminLog(guild.client, {
        title: "Member Kicked",
        description: `${user.tag} was kicked.`,
        color: 0xff9800,
        fields: [
          { name: "User", value: `<@${user.id}>`, inline: true },
          { name: "User ID", value: user.id, inline: true },
          { name: "By", value: executorTag, inline: true },
          { name: "Reason", value: reason },
        ],
      });
      suppressVerification(user.id, 120000);
      const db = getDb();
      if (db) {
        const wasJailed = member.roles?.cache?.has(config.roleJailId);
        setStatus(db, {
          guildId: guild.id,
          userId: user.id,
          status: wasJailed ? "jailed" : "kicked",
          at: Date.now(),
        });
      }
      await clearRulesReactionById(guild, user.id);
      return;
    }

    await sendAdminLog(guild.client, {
      title: "Member Left",
      description: `${user.tag} left the server.`,
      color: 0x9e9e9e,
      fields: [
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "User ID", value: user.id, inline: true },
      ],
    });
    log.info(`[leave] ${user.tag} left the server`);
    suppressVerification(user.id, 120000);
    const db = getDb();
    if (db) {
      const wasJailed = member.roles?.cache?.has(config.roleJailId);
      setStatus(db, {
        guildId: guild.id,
        userId: user.id,
        status: wasJailed ? "jailed" : "left",
        at: Date.now(),
      });
    }
    await clearRulesReactionById(guild, user.id);
  } catch (err) {
    log.error("guildMemberRemove handler failed.", err);
  }
}

module.exports = { onGuildMemberRemove };
