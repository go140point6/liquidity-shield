// ./events/onMessageDelete.js
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { getMessage } = require("../utils/messageCache");
const { shouldSkipChannel } = require("../utils/modLogFilters");

function formatContent(content) {
  if (!content) return "*(no content)*";
  const trimmed = content.trim();
  if (!trimmed) return "*(no content)*";
  if (trimmed.length <= 1000) return trimmed;
  return `${trimmed.slice(0, 1000)}…`;
}

async function onMessageDelete(message) {
  try {
    if (!message.guild) return;
    if (shouldSkipChannel(message.channel)) return;

    const cached = getMessage(message.id);
    const authorTag = cached?.authorTag || message.author?.tag || "Unknown";
    const authorId = cached?.authorId || message.author?.id || "Unknown";
    const authorRef =
      authorId && authorId !== "Unknown" ? `<@${authorId}>` : authorTag;
    const content = cached?.content || message.content || "";
    const attachments = cached?.attachments || [];

    const fields = [
      { name: "Author", value: authorRef, inline: true },
      { name: "User ID", value: authorId, inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Content", value: formatContent(content) },
      { name: "Message ID", value: message.id },
    ];

    if (attachments.length > 0) {
      const list = attachments.slice(0, 5).join("\n");
      fields.push({ name: "Attachments", value: list });
    }

    await sendAdminLog(message.client, {
      title: "Message Deleted",
      description: "A message was deleted.",
      color: 0xe53935,
      fields,
    });
  } catch (err) {
    log.error("messageDelete handler failed.", err);
  }
}

module.exports = { onMessageDelete };
