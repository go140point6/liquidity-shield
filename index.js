// ./index.js
require("dotenv").config({
  quiet: true,
});

const { Client, Events, Partials } = require("discord.js");
const { GatewayIntentBits } = require("./config/GatewayIntentBits");
const { onReady } = require("./events/onReady");
const { onGuildMemberAdd } = require("./events/onGuildMemberAdd");
const { onGuildMemberUpdate } = require("./events/onGuildMemberUpdate");
const { onMessage } = require("./events/onMessage");
const { onMessageReactionAdd } = require("./events/onMessageReactionAdd");
const { onMessageReactionRemove } = require("./events/onMessageReactionRemove");
const { validateEnv } = require("./utils/validateEnv");
const log = require("./utils/logger");

function fatal(message, error) {
  log.error(message);
  if (error) log.error(error);
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  fatal("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  fatal("Uncaught exception", err);
});

(async () => {
  validateEnv();

  const client = new Client({
    intents: GatewayIntentBits,
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  module.exports = client;

  client.once(Events.ClientReady, async () => {
    try {
      await onReady(client);
    } catch (err) {
      fatal("Error in onReady handler", err);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await onGuildMemberAdd(member);
    } catch (err) {
      log.error("GuildMemberAdd handler failed:", err);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      await onGuildMemberUpdate(oldMember, newMember);
    } catch (err) {
      log.error("GuildMemberUpdate handler failed:", err);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await onMessage(message);
    } catch (err) {
      log.error("MessageCreate handler failed:", err);
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await onMessageReactionAdd(reaction, user);
    } catch (err) {
      log.error("MessageReactionAdd handler failed:", err);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      await onMessageReactionRemove(reaction, user);
    } catch (err) {
      log.error("MessageReactionRemove handler failed:", err);
    }
  });

  try {
    await client.login(process.env.BOT_TOKEN);
    log.startup("Discord client login succeeded.");
  } catch (err) {
    fatal("Discord client login failed (check BOT_TOKEN and bot permissions).", err);
  }
})();
