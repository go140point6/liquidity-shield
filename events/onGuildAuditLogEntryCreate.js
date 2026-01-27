// ./events/onGuildAuditLogEntryCreate.js
const { AuditLogEvent } = require("discord.js");
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { isRecentBulkDelete, isBulkSuppressedForUser } = require("../utils/modLogSuppress");

async function onGuildAuditLogEntryCreate(entry, guild) {
  try {
    if (entry.action !== AuditLogEvent.MessageBulkDelete) return;
    const channelId = entry.extra?.channel?.id;
    const count = entry.extra?.count || 0;
    const targetId = entry.target?.id;

    if (channelId && count && isRecentBulkDelete(channelId, count)) return;
    if (targetId && isBulkSuppressedForUser(targetId)) return;

    await sendAdminLog(guild.client, {
      title: "Messages Bulk Deleted",
      description: "A bulk delete was performed.",
      color: 0xff5722,
      fields: [
        { name: "Channel", value: channelId ? `<#${channelId}>` : "Unknown", inline: true },
        { name: "Count", value: String(count), inline: true },
        { name: "By", value: entry.executor?.tag || "Unknown", inline: true },
        {
          name: "Target",
          value: entry.target?.id ? `<@${entry.target.id}>` : entry.target?.tag || "Unknown",
          inline: true,
        },
      ],
    });
  } catch (err) {
    log.error("guildAuditLogEntryCreate handler failed.", err);
  }
}

module.exports = { onGuildAuditLogEntryCreate };
