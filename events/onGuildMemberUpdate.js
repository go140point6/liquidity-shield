// ./events/onGuildMemberUpdate.js
const log = require("../utils/logger");
const { config } = require("../config/botConfig");
const { protectedIds } = require("../config/protectedIds");
const {
  getProtectedNameSet,
  isImpersonation,
} = require("../services/verificationGate");
const { sendAdminLog } = require("../utils/adminLog");
const { handleMemberUpdate, intermentMember } = require("../services/verificationGate");

async function onGuildMemberUpdate(oldMember, newMember) {
  try {
    await handleMemberUpdate(oldMember, newMember);

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
    }

    await handleImpersonationCheck(oldMember, newMember);

    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
    if (oldTimeout !== newTimeout) {
      if (newTimeout > Date.now()) {
        try {
          await newMember.timeout(null, "Converted timeout to interment.");
        } catch (err) {
          log.warn("Failed to clear timeout before interment.", err);
        }

        try {
          await intermentMember(newMember, "timeout->interment");
        } catch (err) {
          log.error("Failed to inter users on timeout.", err);
        }

        await sendAdminLog(newMember.client, {
          title: "Timeout Converted",
          description: `${newMember.user.tag} timed out -> interment.`,
          color: 0xffb300,
          fields: [
            { name: "User", value: `<@${newMember.id}>`, inline: true },
            { name: "User ID", value: newMember.id, inline: true },
          ],
        });

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
        log.info(`[timeout] ${newMember.user.tag} converted to interment`);
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
  if (newMember.roles.cache.has(config.roleJailId)) return;
  if (config.protectedRoleIds.some((id) => newMember.roles.cache.has(id))) return;
  if (protectedIds.includes(newMember.id)) return;

  const oldName = oldMember.displayName || oldMember.user?.username || "";
  const newName = newMember.displayName || newMember.user?.username || "";
  if (oldName === newName) return;

  const protectedSet = getProtectedNameSet(newMember.guild);
  if (!isImpersonation(newName, protectedSet, newMember.id)) return;

  await intermentMember(newMember, "impersonation");

  await sendAdminLog(newMember.client, {
    title: "Impersonation Detected",
    description: `${newMember.user.tag} moved to interment.`,
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

module.exports = { onGuildMemberUpdate };
