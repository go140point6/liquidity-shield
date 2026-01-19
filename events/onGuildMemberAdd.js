// ./events/onGuildMemberAdd.js
const log = require("../utils/logger");
const { handleMemberAdd } = require("../services/verificationGate");

async function onGuildMemberAdd(member) {
  try {
    await handleMemberAdd(member);
  } catch (err) {
    log.error("guildMemberAdd handler failed.", err);
  }
}

module.exports = { onGuildMemberAdd };
