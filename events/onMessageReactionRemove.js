// ./events/onMessageReactionRemove.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const { getRulesConfig } = require("../services/verificationGate");

async function onMessageReactionRemove(reaction, user) {
  if (user?.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message?.partial) await reaction.message.fetch();
  } catch (err) {
    log.warn("Failed to fetch partial reaction/message.", err);
    return;
  }

  const message = reaction.message;
  if (!message?.guild) return;
  if (message.guild.id !== config.guildId) return;

  const rulesConfig = getRulesConfig(message.guild.id);
  if (!rulesConfig) return;
  if (message.id !== rulesConfig.message_id) return;

  const emojiName = reaction.emoji?.name;
  if (emojiName !== config.rulesEmoji) return;

  let member;
  try {
    member = await message.guild.members.fetch(user.id);
  } catch (err) {
    log.warn(`Failed to fetch member ${user.id} for reaction remove.`, err);
    return;
  }

  if (!member.roles.cache.has(config.roleVerifiedId)) return;
  try {
    await member.roles.remove(config.roleVerifiedId, "Removed rules reaction.");
  } catch (err) {
    log.error(`Failed to remove verified role from ${user.id}.`, err);
  }
}

module.exports = { onMessageReactionRemove };
