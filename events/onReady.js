// ./events/onReady.js

const log = require("../utils/logger");
const { initVerificationGate } = require("../services/verificationGate");

async function onReady(client) {
  log.startup(`Ready! Logged in as ${client.user.tag}`);
  await initVerificationGate(client);
  log.startup("Liquidity Shield verification gate initialized.");
}

module.exports = { onReady };
