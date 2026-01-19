# Liquidity Shield

A **Discord.js v14 verification gate** that tracks verification failures in SQLite and enforces kick/ban rules on a restart-safe schedule.

Core behavior:
- On join, the bot starts a verification deadline.
- If the member gains the Minion role before the deadline, it resets failures.
- If the member is Penitent (jailed), it skips action.
- If the deadline hits with no Minion role:
  - First failure: kick.
  - Second failure: ban.

The deadline check runs on a DB-backed polling loop so it survives restarts.

---

## Requirements

- **Node.js 18+**
- A Discord application and bot token

This project includes a `.nvmrc` file. If you use nvm, run:

```bash
nvm use
```

Set the .nvmrc file to your major Node version (i.e. 24, 22, 20, or minimum 18).
Tested on Node 20 and 24, .nvmrc is currently set to 24.

---

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env-template .env
```

Fill in the required values in `.env`.

Start the bot:

```bash
node index.js
```

RECOMMENDED: Use pm2 or another process manager for production.

---

## Environment configuration

All required configuration is provided via environment variables.

At minimum, you must set:
- `BOT_TOKEN`
- `GUILD_ID`
- `ROLE_VERIFIED_ID`
- `ROLE_JAIL_ID`
- `ADMIN_LOG_CHANNEL_ID`
- `VERIFY_TIMEOUT_MIN`
- `POLL_INTERVAL_SEC`

See `.env-template` for the full list.

---

## Logging

This template uses a **custom lightweight logger** instead of raw `console.*`.

Features include:
- Log levels (`STARTUP`, `ERROR`, `WARN`, `INFO`, `DEBUG`)
- Always-visible startup confirmation
- Optional ANSI color output
- Single-point verbosity control via `.env`

Full documentation:
```
./docs/LOGGER.md
```

---

## License

MIT
