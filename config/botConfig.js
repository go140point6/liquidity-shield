// ./config/botConfig.js
const path = require("node:path");
function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function parseCsvEnv(name) {
  const raw = readEnv(name);
  if (!raw) return [];
  return raw
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean);
}

function readIntEnv(name) {
  const raw = readEnv(name);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

const config = {
  token: readEnv("BOT_TOKEN"),
  guildId: readEnv("GUILD_ID"),
  roleVerifiedId: readEnv("ROLE_VERIFIED_ID"),
  roleJailId: readEnv("ROLE_JAIL_ID"),
  adminLogChannelId: readEnv("ADMIN_LOG_CHANNEL_ID"),
  rulesChannelId: readEnv("RULES_CHANNEL_ID"),
  rulesEmoji: readEnv("RULES_EMOJI"),
  faqChannelId: readEnv("FAQ_CHANNEL_ID"),
  quickStartChannelId: readEnv("QUICKSTART_CHANNEL_ID"),
  welcomeChannelId: readEnv("WELCOME_CHANNEL_ID"),
  roleInitiateId: readEnv("ROLE_INITIATE_ID"),
  roleAutomataId: readEnv("ROLE_AUTOMATA_ID"),
  verifyTimeoutMs: readIntEnv("VERIFY_TIMEOUT_MIN") * 60 * 1000,
  pollIntervalMs: readIntEnv("POLL_INTERVAL_SEC") * 1000,
  excludedChannelIds: parseCsvEnv("EXCLUDED_CHANNEL_IDS"),
  excludedCategoryIds: parseCsvEnv("EXCLUDED_CATEGORY_IDS"),
  protectedRoleIds: parseCsvEnv("PROTECTED_ROLE_IDS"),
  dbPath: readEnv("DB_PATH"),
};

module.exports = { config };
