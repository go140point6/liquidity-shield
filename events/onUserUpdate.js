// ./events/onUserUpdate.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const { sendAdminLog } = require("../utils/adminLog");
const {
  isImpersonation,
  isProtectedPrincipalId,
  intermentMember,
  runImpersonationHealthCheck,
} = require("../services/verificationGate");

async function onUserUpdate(oldUser, newUser, client) {
  if (!oldUser || !newUser) return;
  if (oldUser.bot || newUser.bot) return;

  const oldName = (oldUser.globalName || oldUser.username || "").trim();
  const newName = (newUser.globalName || newUser.username || "").trim();
  if (oldName === newName) return;
  const protectedId = await isProtectedPrincipalId(config.guildId, newUser.id);

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

  await sendAdminLog(client, {
    title: "Global Display Name Changed",
    description: `${newUser.tag} changed global display name.`,
    color: 0x607d8b,
    fields: [
      { name: "Before", value: oldName || "*(none)*", inline: true },
      { name: "After", value: newName || "*(none)*", inline: true },
      { name: "User", value: `<@${newUser.id}>`, inline: true },
      { name: "User ID", value: newUser.id, inline: true },
    ],
  });
  log.info(
    `[global-display] ${newUser.tag} ${oldName || "(none)"} -> ${
      newName || "(none)"
    }`
  );

  const hasProtectedRole = config.protectedRoleIds.some((id) =>
    member.roles.cache.has(id)
  );
  if (hasProtectedRole || protectedId) {
    await runImpersonationHealthCheck(client);
  }

  if (member.roles.cache.has(config.roleJailId)) return;
  if (protectedId) {
    log.debug(
      `[impersonation-skip] protected principal id user=${newUser.tag} (${newUser.id})`
    );
    return;
  }
  if (!(await isImpersonation(guild.id, newName, newUser.id))) return;

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
