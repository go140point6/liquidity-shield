// ./config/botConfig.js
const path = require("node:path");
const log = require("../utils/logger");

function requireEnv(name) {
  const val = process.env[name];
  if (!val || !val.trim()) {
    log.error(`Missing required env var ${name}. Add it to your .env file.`);
    process.exit(1);
  }
  return val.trim();
}

function requireIntEnv(name) {
  const raw = requireEnv(name);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    log.error(`Env var ${name} must be a positive integer. Got: "${raw}"`);
    process.exit(1);
  }
  return n;
}

const config = {
  token: requireEnv("BOT_TOKEN"),
  guildId: requireEnv("GUILD_ID"),
  roleVerifiedId: requireEnv("ROLE_VERIFIED_ID"),
  roleJailId: requireEnv("ROLE_JAIL_ID"),
  adminLogChannelId: requireEnv("ADMIN_LOG_CHANNEL_ID"),
  rulesChannelId: requireEnv("RULES_CHANNEL_ID"),
  rulesEmoji: requireEnv("RULES_EMOJI"),
  welcomeChannelId: requireEnv("WELCOME_CHANNEL_ID"),
  roleInitiateId: requireEnv("ROLE_INITIATE_ID"),
  roleAutomataId: requireEnv("ROLE_AUTOMATA_ID"),
  verifyTimeoutMs: requireIntEnv("VERIFY_TIMEOUT_MIN") * 60 * 1000,
  pollIntervalMs: requireIntEnv("POLL_INTERVAL_SEC") * 1000,
  dbPath:
    process.env.DB_PATH?.trim() ||
    path.join(__dirname, "..", "data", "liquidity-shield.sqlite"),
};

module.exports = { config };
