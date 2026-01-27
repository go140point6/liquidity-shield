// ./events/onGuildBanAdd.js
const { AuditLogEvent } = require("discord.js");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { suppressVerification, clearRulesReactionById } = require("../services/verificationGate");
const { getDb } = require("../db/db");
const { setStatus } = require("../db/queries");
const { getRecentMessagesByAuthor } = require("../utils/messageCache");

async function onGuildBanAdd(ban) {
  try {
    const { guild, user } = ban;
    let executorTag = "Unknown";
    let reason = "Unknown";

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 5,
      });
      const entry = logs.entries.find((logEntry) => logEntry.target?.id === user.id);
      if (entry) {
        executorTag = entry.executor?.tag || executorTag;
        reason = entry.reason || reason;
      }
    } catch (err) {
      log.warn("Failed to fetch audit log for ban.", err);
    }

    log.info(`[ban] ${user.tag} banned by ${executorTag}`);
    await sendAdminLog(guild.client, {
      title: "Member Banned",
      description: `${user.tag} was banned.`,
      color: 0xe53935,
      fields: [
        { name: "User", value: `<@${user.id}>`, inline: true },
        { name: "User ID", value: user.id, inline: true },
        { name: "By", value: executorTag, inline: true },
        { name: "Reason", value: reason },
      ],
    });

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const samples = getRecentMessagesByAuthor(user.id, since, 50);
    if (samples.length > 0) {
      const lines = [];
      const attachmentUrls = [];
      const seenContent = new Set();
      const seenUrls = new Set();

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
          const filename = url.split("?")[0].split("/").pop() || url;
          const fileKey = filename.toLowerCase();
          if (seenUrls.has(fileKey)) continue;
          seenUrls.add(fileKey);
          attachmentUrls.push(url);
        }

        if (lines.length >= 25 && attachmentUrls.length >= 25) break;
      }

      await sendAdminLog(guild.client, {
        title: "Ban Evidence (Cached)",
        description: `Recent cached messages for ${user.tag}`,
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

    suppressVerification(user.id, 120000);
    const db = getDb();
    if (db) {
      setStatus(db, {
        guildId: guild.id,
        userId: user.id,
        status: "banned",
        at: Date.now(),
      });
    }
    await clearRulesReactionById(guild, user.id);
  } catch (err) {
    log.error("guildBanAdd handler failed.", err);
  }
}

module.exports = { onGuildBanAdd };
