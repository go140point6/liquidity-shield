// ./utils/adminLog.js
const { EmbedBuilder } = require("discord.js");
const { config } = require("../config/botConfig");
const log = require("./logger");

async function sendAdminLog(client, { title, description, color, fields }) {
  let channel;
  try {
    channel = await client.channels.fetch(config.adminLogChannelId);
  } catch (err) {
    log.error("Failed to fetch admin log channel.", err);
    return;
  }

  if (!channel || !channel.isTextBased()) {
    log.error("Admin log channel is missing or not text-based.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description || "")
    .setColor(color || 0xffa500)
    .setTimestamp(new Date());

  if (Array.isArray(fields) && fields.length > 0) {
    const safeFields = fields
      .filter((field) => field && field.name && field.value !== undefined)
      .map((field) => ({
        ...field,
        value:
          typeof field.value === "string"
            ? field.value.slice(0, 1024)
            : String(field.value).slice(0, 1024),
      }));
    if (safeFields.length > 0) {
      embed.addFields(safeFields);
    }
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.error("Failed to post to admin log channel.", err);
  }
}

module.exports = { sendAdminLog };
