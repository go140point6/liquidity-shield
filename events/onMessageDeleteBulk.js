// ./events/onMessageDeleteBulk.js
const log = require("../utils/logger");
const { sendAdminLog } = require("../utils/adminLog");
const { getMessage } = require("../utils/messageCache");
const { shouldSkipChannel } = require("../utils/modLogFilters");
const { recordBulkDelete } = require("../utils/modLogSuppress");

async function onMessageDeleteBulk(messages) {
  try {
    const first = messages.first();
    if (!first?.guild) return;
    if (shouldSkipChannel(first.channel)) return;

    const samples = [];
    for (const message of messages.values()) {
      const cached = getMessage(message.id);
      if (!cached) continue;
      const line = `${cached.authorTag || "Unknown"}: ${
        cached.content ? cached.content.slice(0, 200) : "(no content)"
      }`;
      samples.push(line);
      if (samples.length >= 5) break;
    }

    const fields = [
      { name: "Channel", value: `<#${first.channelId}>`, inline: true },
      { name: "Count", value: String(messages.size), inline: true },
    ];

    if (samples.length > 0) {
      fields.push({ name: "Samples", value: samples.join("\n") });
    }

    await sendAdminLog(first.client, {
      title: "Messages Bulk Deleted",
      description: "A bulk delete was performed.",
      color: 0xff5722,
      fields,
    });

    recordBulkDelete(first.channelId, messages.size);
  } catch (err) {
    log.error("messageDeleteBulk handler failed.", err);
  }
}

module.exports = { onMessageDeleteBulk };
