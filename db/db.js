// ./db/db.js
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");
const log = require("../utils/logger");

function openDb(dbPath) {
  const resolved = path.resolve(dbPath);
  const dir = path.dirname(resolved);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    log.error(`Failed to ensure DB directory exists: ${dir}`, err);
    throw err;
  }

  return new Database(resolved);
}

module.exports = { openDb };
