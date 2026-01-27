// ./events/onUserUpdate.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const { protectedIds } = require("../config/protectedIds");
const { sendAdminLog } = require("../utils/adminLog");
const {
  getProtectedNameSet,
  isImpersonation,
  intermentMember,
} = require("../services/verificationGate");

async function onUserUpdate(oldUser, newUser, client) {
  if (!oldUser || !newUser) return;
  if (oldUser.bot || newUser.bot) return;

  const oldName = (oldUser.globalName || oldUser.username || "").trim();
  const newName = (newUser.globalName || newUser.username || "").trim();
  if (oldName === newName) return;
  if (protectedIds.includes(newUser.id)) return;

  let guild;
  try {
    guild = await client.guilds.fetch(config.guildId);
  } catch (err) {
    log.warn("Failed to fetch guild for userUpdate.", err);
    return;
  }

  let member;
  try {
    member = await guild.members.fetch(newUser.id);
  } catch {
    return;
  }

  if (member.roles.cache.has(config.roleJailId)) return;
  if (config.protectedRoleIds.some((id) => member.roles.cache.has(id))) return;

  const protectedSet = getProtectedNameSet(guild);
  if (!isImpersonation(newName, protectedSet, newUser.id)) return;

  await intermentMember(member, "impersonation-global");

  await sendAdminLog(client, {
    title: "Impersonation Detected (Global Name)",
    description: `${newUser.tag} moved to interment.`,
    color: 0xff5722,
    fields: [
      { name: "User", value: `<@${newUser.id}>`, inline: true },
      { name: "User ID", value: newUser.id, inline: true },
      { name: "Before", value: oldName || "*(none)*", inline: true },
      { name: "After", value: newName || "*(none)*", inline: true },
    ],
  });

  log.info(
    `[impersonation-global] ${newUser.tag} ${oldName || "(none)"} -> ${
      newName || "(none)"
    }`
  );
}

module.exports = { onUserUpdate };
