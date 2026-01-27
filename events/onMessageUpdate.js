// ./events/onMessageUpdate.js
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { getMessage, setMessage } = require("../utils/messageCache");
const { shouldSkipChannel } = require("../utils/modLogFilters");

function formatContent(content) {
  if (!content) return "*(no content)*";
  const trimmed = content.trim();
  if (!trimmed) return "*(no content)*";
  if (trimmed.length <= 1000) return trimmed;
  return `${trimmed.slice(0, 1000)}…`;
}

async function onMessageUpdate(oldMessage, newMessage) {
  try {
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;
    if (shouldSkipChannel(newMessage.channel)) return;

    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch (err) {
        log.warn("Failed to fetch partial updated message.", err);
      }
    }

    const cached = getMessage(newMessage.id);
    const before = cached?.content ?? oldMessage?.content ?? "";
    const after = newMessage.content ?? "";
    if (before === after) {
      setMessage(newMessage);
      return;
    }

    const authorId = newMessage.author?.id || cached?.authorId || "Unknown";
    const authorRef =
      authorId !== "Unknown" ? `<@${authorId}>` : newMessage.author?.tag || "Unknown";

    await sendAdminLog(newMessage.client, {
      title: "Message Edited",
      description: `Channel: <#${newMessage.channelId}>`,
      color: 0xffc107,
      fields: [
        { name: "Author", value: authorRef, inline: true },
        { name: "User ID", value: authorId, inline: true },
        { name: "Before", value: formatContent(before) },
        { name: "After", value: formatContent(after) },
        { name: "Message ID", value: newMessage.id },
      ],
    });

    setMessage(newMessage);
  } catch (err) {
    log.error("messageUpdate handler failed.", err);
  }
}

module.exports = { onMessageUpdate };
