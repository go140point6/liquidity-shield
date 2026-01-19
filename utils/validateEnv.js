// ./utils/validateEnv.js

const log = require("./logger");

function validateEnv() {
  // Add any additional required env vars here
  const requiredVars = [
    "BOT_TOKEN",
    "GUILD_ID",
    "ROLE_VERIFIED_ID",
    "ROLE_JAIL_ID",
    "ADMIN_LOG_CHANNEL_ID",
    "RULES_CHANNEL_ID",
    "RULES_EMOJI",
    "WELCOME_CHANNEL_ID",
    "ROLE_INITIATE_ID",
    "ROLE_AUTOMATA_ID",
    "VERIFY_TIMEOUT_MIN",
    "POLL_INTERVAL_SEC",
  ];

  const missing = requiredVars.filter(
    (key) => !process.env[key] || !process.env[key].trim()
  );

  if (missing.length > 0) {
    log.error(
      "Missing required environment variables:\n" +
        missing.map((v) => `  - ${v}`).join("\n") +
        "\n\nFix your .env file and restart the bot."
    );
    process.exit(1);
  }

  const intVars = ["VERIFY_TIMEOUT_MIN", "POLL_INTERVAL_SEC"];
  for (const key of intVars) {
    const raw = process.env[key].trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      log.error(`${key} must be a positive integer. Got: "${raw}"`);
      process.exit(1);
    }
  }
}

module.exports = { validateEnv };
