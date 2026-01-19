// ./events/onMessageReactionAdd.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const { getRulesConfig } = require("../services/verificationGate");

async function onMessageReactionAdd(reaction, user) {
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
    log.warn(`Failed to fetch member ${user.id} for reaction add.`, err);
    return;
  }

  if (member.roles.cache.has(config.roleVerifiedId)) return;
  try {
    await member.roles.add(config.roleVerifiedId, "Accepted rules reaction.");
    if (member.roles.cache.has(config.roleInitiateId)) {
      await member.roles.remove(
        config.roleInitiateId,
        "Promoted from Initiate to Verified."
      );
    }
  } catch (err) {
    log.error(`Failed to add verified role to ${user.id}.`, err);
  }
}

module.exports = { onMessageReactionAdd };
