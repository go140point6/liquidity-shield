// ./db/db.js
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");
const log = require("../utils/logger");

let dbInstance = null;

function openDb(dbPath) {
  const resolved = path.resolve(dbPath);
  const dir = path.dirname(resolved);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    log.error(`Failed to ensure DB directory exists: ${dir}`, err);
    throw err;
  }

  dbInstance = new Database(resolved);
  return dbInstance;
}

function getDb() {
  return dbInstance;
}

module.exports = { openDb, getDb };
