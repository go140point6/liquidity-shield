// ./events/onGuildMemberUpdate.js
const log = require("../utils/logger");
const { handleMemberUpdate } = require("../services/verificationGate");

async function onGuildMemberUpdate(oldMember, newMember) {
  try {
    await handleMemberUpdate(oldMember, newMember);
  } catch (err) {
    log.error("guildMemberUpdate handler failed.", err);
  }
}

module.exports = { onGuildMemberUpdate };
