// ./config/GatewayIntentBits.js
const { GatewayIntentBits } = require("discord.js");

/**
 * Centralized gateway intents for the bot.
 * Add or remove intents here as features evolve.
 */
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions,
];

module.exports = {
  GatewayIntentBits: intents,
};
