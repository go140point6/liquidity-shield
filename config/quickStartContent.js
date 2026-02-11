// ./config/quickStartContent.js
const quickStartBlocks = [
  {
    type: "text",
    content: `# Liquidity Sentinel — Quick Start Guide

This guide walks you through adding a wallet, using the core commands, and understanding the daily heartbeat summary.`,
  },
  {
    type: "text",
    content: `## 1) Add your wallet

Use the \`/my-wallets\` command to add a wallet address you want the bot to track.

**What you’ll do:**
- Add a wallet address (optional label for easy recognition).
- Confirm it shows as enabled.
- Set LP alert behavior with the wallet-level flag controls.
- Set your daily heartbeat delivery hour/timezone (and enable/disable heartbeat).

**What you’ll see:**
- The wallet listed with the label you chose.
- Any detected positions tied to that wallet will appear over time.
- Wallet controls for alert filtering and heartbeat scheduling.`,
  },
  { type: "images", files: ["my-wallets.png"] },
  {
    type: "text",
    content: `## 2) Check your loans

Use \`/my-loans\` to see your loan/trove positions and their current risk tiers.

**What you’ll see:**
- Your tracked loan positions.
- Liquidation and redemption risk tiers.
- Current health signals in a compact summary.`,
  },
  { type: "images", files: ["my-loans.png"] },
  {
    type: "text",
    content: `## 3) Check your LP positions

Use \`/my-lp\` to see your Uniswap v3 liquidity positions and range status.

**What you’ll see:**
- Each LP position and its in-range/out-of-range state.
- Range tier showing how close you are to the edge.
- Estimated liquidity and fees context.`,
  },
  { type: "images", files: ["my-lp.png"] },
  {
    type: "text",
    content: `## 4) Ignore noisy transactions (optional)

If you see noisy transactions you don’t want alerts for, use \`/ignore-spam-tx\`.

**What you’ll see:**
- Confirmation that a noisy transaction (or pattern) is ignored.
- Cleaner alert stream going forward.`,
  },
  { type: "images", files: ["ignore-spam-tx.png"] },
  {
    type: "text",
    content: `## 5) Daily heartbeat summary

Once per day, the bot sends a summary DM with the current state of your tracked positions.

**What to expect:**
- A clean overview of loans and LPs.
- Risk tiers and status markers for quick scanning.
- Key signals without needing to run commands.
- Delivery time based on your \`/my-wallets\` hour/timezone selection.`,
  },
  { type: "images", files: ["daily-heartbeat.png"] },
  {
    type: "text",
    content: `## 6) Check redemption tiers

Use \`/redemption-rate\` to see current target rates and where your loan sits in redemption risk tiers.

**What to expect:**
- Current tier thresholds and practical guidance.
- A quick way to understand how close your position is to risk boundaries.`,
  },
  { type: "images", files: ["redemption-rate.png"] },
  {
    type: "text",
    content: `## 7) Monitor active alerts

**What to expect:**
- Alert updates when risk posture improves or worsens.
- Follow-up updates as conditions change.`,
  },
  { type: "images", files: ["alert-improving.png", "alert-worsening.png"] },
];

module.exports = { quickStartBlocks };
