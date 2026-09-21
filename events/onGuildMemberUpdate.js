// ./events/onGuildMemberUpdate.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const {
  isImpersonation,
  isProtectedPrincipalId,
  handleMemberUpdate,
  timeoutMember,
  runImpersonationHealthCheck,
} = require("../services/verificationGate");
const { sendAdminLog } = require("../utils/adminLog");

async function onGuildMemberUpdate(oldMember, newMember) {
  try {
    await handleMemberUpdate(oldMember, newMember);

    const oldDisplayName = oldMember.displayName || oldMember.user?.username || "(none)";
    const newDisplayName = newMember.displayName || newMember.user?.username || "(none)";
    if (oldMember.nickname !== newMember.nickname) {
      await sendAdminLog(newMember.client, {
        title: "Nickname Changed",
        description: `${newMember.user.tag} updated their nickname.`,
        color: 0x607d8b,
        fields: [
          {
            name: "Before",
            value: oldMember.nickname || "*(none)*",
            inline: true,
          },
          {
            name: "After",
            value: newMember.nickname || "*(none)*",
            inline: true,
          },
          { name: "User", value: `<@${newMember.id}>`, inline: true },
          { name: "User ID", value: newMember.id, inline: true },
        ],
      });
      log.info(
        `[nick] ${newMember.user.tag} ${oldMember.nickname || "(none)"} -> ${
          newMember.nickname || "(none)"
        }`
      );
    } else if (oldDisplayName !== newDisplayName) {
      await sendAdminLog(newMember.client, {
        title: "Server Display Name Changed",
        description: `${newMember.user.tag} changed their server display name.`,
        color: 0x607d8b,
        fields: [
          { name: "Before", value: oldDisplayName, inline: true },
          { name: "After", value: newDisplayName, inline: true },
          { name: "User", value: `<@${newMember.id}>`, inline: true },
          { name: "User ID", value: newMember.id, inline: true },
        ],
      });
      log.info(
        `[display] ${newMember.user.tag} ${oldDisplayName} -> ${newDisplayName}`
      );
    }

    await handleImpersonationCheck(oldMember, newMember);
    await maybeRunProtectedHealthCheck(oldMember, newMember);

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
    if (oldTimeout !== newTimeout) {
      if (newTimeout > Date.now()) {
        await sendAdminLog(newMember.client, {
          title: "Member Timed Out",
          description: `${newMember.user.tag} was timed out.`,
          color: 0xffb300,
          fields: [
            {
              name: "Until",
              value: new Date(newTimeout).toISOString(),
              inline: true,
            },
            { name: "User", value: `<@${newMember.id}>`, inline: true },
            { name: "User ID", value: newMember.id, inline: true },
          ],
        });
        log.info(`[timeout] ${newMember.user.tag} until ${new Date(newTimeout).toISOString()}`);
      } else {
        await sendAdminLog(newMember.client, {
          title: "Timeout Cleared",
          description: `${newMember.user.tag} timeout was cleared.`,
          color: 0x8bc34a,
          fields: [
            { name: "User", value: `<@${newMember.id}>`, inline: true },
            { name: "User ID", value: newMember.id, inline: true },
          ],
        });
        log.info(`[timeout] ${newMember.user.tag} timeout cleared`);
      }
    }
  } catch (err) {
    log.error("guildMemberUpdate handler failed.", err);
  }
}

async function handleImpersonationCheck(oldMember, newMember) {
  if (newMember.user?.bot) return;
  if (await isProtectedPrincipalId(newMember.guild.id, newMember.id)) {
    log.debug(
      `[impersonation-skip] protected principal id user=${newMember.user.tag} (${newMember.id})`
    );
    return;
  }

  const oldName = oldMember.displayName || oldMember.user?.username || "";
  const newName = newMember.displayName || newMember.user?.username || "";
  if (oldName === newName) return;

  if (!(await isImpersonation(newMember.guild.id, newName, newMember.id))) return;

  await timeoutMember(newMember, "Impersonation detected.");

  await sendAdminLog(newMember.client, {
    title: "Impersonation Detected",
    description: `${newMember.user.tag} was timed out.`,
    color: 0xff5722,
    fields: [
      { name: "User", value: `<@${newMember.id}>`, inline: true },
      { name: "User ID", value: newMember.id, inline: true },
      { name: "Before", value: oldName || "*(none)*", inline: true },
      { name: "After", value: newName || "*(none)*", inline: true },
    ],
  });
  log.info(
    `[impersonation] ${newMember.user.tag} ${oldName || "(none)"} -> ${
      newName || "(none)"
    }`
  );
}

async function maybeRunProtectedHealthCheck(oldMember, newMember) {
  const oldName = oldMember.displayName || oldMember.user?.username || "";
  const newName = newMember.displayName || newMember.user?.username || "";
  if (oldName === newName) return;

  const hasProtectedRole = config.protectedRoleIds.some((id) =>
    newMember.roles.cache.has(id)
  );
  const protectedId = await isProtectedPrincipalId(newMember.guild.id, newMember.id);
  if (!hasProtectedRole && !protectedId) return;

  await runImpersonationHealthCheck(newMember.client);
}

module.exports = { onGuildMemberUpdate };
