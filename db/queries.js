// ./db/queries.js

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_state (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      verify_fails INTEGER NOT NULL DEFAULT 0,
      join_at INTEGER,
      deadline_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      last_action_at INTEGER,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_verification_deadline
      ON verification_state (deadline_at)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS moderation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rules_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faq_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quickstart_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_ids TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_cache (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT,
      author_id TEXT,
      author_tag TEXT,
      content TEXT,
      attachments TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_cache_created_at
      ON message_cache (created_at);

    CREATE TABLE IF NOT EXISTS welcome_state (
      guild_id TEXT PRIMARY KEY,
      last_index INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS protected_principals (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      current_name TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      added_by TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_protected_principals_active
      ON protected_principals (guild_id, active);

    CREATE TABLE IF NOT EXISTS alert_throttle (
      key TEXT PRIMARY KEY,
      last_sent_at INTEGER NOT NULL
    );
  `);
}

function upsertPending(db, { guildId, userId, joinAt, deadlineAt }) {
  db.prepare(
    `
    INSERT INTO verification_state (
      guild_id,
      user_id,
      verify_fails,
      join_at,
      deadline_at,
      status,
      last_action_at
    )
    VALUES (?, ?, 0, ?, ?, 'pending', ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      join_at = excluded.join_at,
      deadline_at = excluded.deadline_at,
      status = 'pending',
      last_action_at = excluded.last_action_at,
      verify_fails = verification_state.verify_fails
  `
  ).run(guildId, userId, joinAt, deadlineAt, joinAt);
}

function getState(db, { guildId, userId }) {
  return db
    .prepare(
      `
    SELECT guild_id, user_id, verify_fails, join_at, deadline_at, status, last_action_at
    FROM verification_state
    WHERE guild_id = ? AND user_id = ?
  `
    )
    .get(guildId, userId);
}

function getDuePending(db, nowMs) {
  return db
    .prepare(
      `
    SELECT guild_id, user_id, verify_fails, join_at, deadline_at, status, last_action_at
    FROM verification_state
    WHERE status = 'pending' AND deadline_at <= ?
    ORDER BY deadline_at ASC
  `
    )
    .all(nowMs);
}

function setVerified(db, { guildId, userId, at }) {
  db.prepare(
    `
    UPDATE verification_state
    SET status = 'verified',
        verify_fails = 0,
        deadline_at = NULL,
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(at, guildId, userId);
}

function setJailed(db, { guildId, userId, at }) {
  db.prepare(
    `
    UPDATE verification_state
    SET status = 'jailed',
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(at, guildId, userId);
}

function setKicked(db, { guildId, userId, at, verifyFails }) {
  db.prepare(
    `
    UPDATE verification_state
    SET status = 'kicked',
        verify_fails = ?,
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(verifyFails, at, guildId, userId);
}

function setBanned(db, { guildId, userId, at, verifyFails }) {
  db.prepare(
    `
    UPDATE verification_state
    SET status = 'banned',
        verify_fails = ?,
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(verifyFails, at, guildId, userId);
}

function setLeft(db, { guildId, userId, at }) {
  db.prepare(
    `
    UPDATE verification_state
    SET status = 'left',
        deadline_at = NULL,
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(at, guildId, userId);
}

function deferPending(db, { guildId, userId, nextDeadlineAt, at }) {
  db.prepare(
    `
    UPDATE verification_state
    SET deadline_at = ?,
        last_action_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(nextDeadlineAt, at, guildId, userId);
}

function logModeration(db, { guildId, userId, action, status, details, error, at }) {
  db.prepare(
    `
    INSERT INTO moderation_log (
      guild_id,
      user_id,
      action,
      status,
      details,
      error,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    guildId,
    userId,
    action,
    status,
    details || null,
    error || null,
    at
  );
}

function setRulesMessage(db, { guildId, channelId, messageId, at }) {
  db.prepare(
    `
    INSERT INTO rules_config (guild_id, channel_id, message_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      updated_at = excluded.updated_at
  `
  ).run(guildId, channelId, messageId, at);
}

function getRulesMessage(db, { guildId }) {
  return db
    .prepare(
      `
    SELECT guild_id, channel_id, message_id, updated_at
    FROM rules_config
    WHERE guild_id = ?
  `
    )
    .get(guildId);
}

function setFaqMessage(db, { guildId, channelId, messageId, at }) {
  db.prepare(
    `
    INSERT INTO faq_config (guild_id, channel_id, message_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      updated_at = excluded.updated_at
  `
  ).run(guildId, channelId, messageId, at);
}

function getFaqMessage(db, { guildId }) {
  return db
    .prepare(
      `
    SELECT guild_id, channel_id, message_id, updated_at
    FROM faq_config
    WHERE guild_id = ?
  `
    )
    .get(guildId);
}

function setQuickStartMessage(db, { guildId, channelId, messageIds, at }) {
  db.prepare(
    `
    INSERT INTO quickstart_config (guild_id, channel_id, message_ids, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_ids = excluded.message_ids,
      updated_at = excluded.updated_at
  `
  ).run(guildId, channelId, messageIds, at);
}

function getQuickStartMessage(db, { guildId }) {
  return db
    .prepare(
      `
    SELECT guild_id, channel_id, message_ids, updated_at
    FROM quickstart_config
    WHERE guild_id = ?
  `
    )
    .get(guildId);
}

function upsertMessageCache(db, entry) {
  db.prepare(
    `
    INSERT INTO message_cache (
      message_id,
      guild_id,
      channel_id,
      author_id,
      author_tag,
      content,
      attachments,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      guild_id = excluded.guild_id,
      channel_id = excluded.channel_id,
      author_id = excluded.author_id,
      author_tag = excluded.author_tag,
      content = excluded.content,
      attachments = excluded.attachments,
      created_at = excluded.created_at
  `
  ).run(
    entry.id,
    entry.guildId,
    entry.channelId,
    entry.authorId,
    entry.authorTag,
    entry.content,
    entry.attachments,
    entry.createdAt
  );
}

function getMessageCache(db, messageId) {
  return db
    .prepare(
      `
    SELECT message_id, guild_id, channel_id, author_id, author_tag, content, attachments, created_at
    FROM message_cache
    WHERE message_id = ?
  `
    )
    .get(messageId);
}

function deleteExpiredMessageCache(db, cutoff) {
  db.prepare(`DELETE FROM message_cache WHERE created_at < ?`).run(cutoff);
}

function getMessageCacheByAuthorSince(db, { authorId, since, limit }) {
  return db
    .prepare(
      `
    SELECT message_id, guild_id, channel_id, author_id, author_tag, content, attachments, created_at
    FROM message_cache
    WHERE author_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(authorId, since, limit);
}

function setStatus(db, { guildId, userId, status, at }) {
  db.prepare(
    `
    INSERT INTO verification_state (
      guild_id,
      user_id,
      verify_fails,
      status,
      last_action_at,
      deadline_at
    )
    VALUES (?, ?, 0, ?, ?, NULL)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      status = excluded.status,
      last_action_at = excluded.last_action_at,
      deadline_at = NULL
  `
  ).run(guildId, userId, status, at);
}

function getWelcomeState(db, { guildId }) {
  return db
    .prepare(
      `
    SELECT guild_id, last_index, updated_at
    FROM welcome_state
    WHERE guild_id = ?
  `
    )
    .get(guildId);
}

function setWelcomeState(db, { guildId, lastIndex, at }) {
  db.prepare(
    `
    INSERT INTO welcome_state (guild_id, last_index, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      last_index = excluded.last_index,
      updated_at = excluded.updated_at
  `
  ).run(guildId, lastIndex, at);
}

function resetFails(db, { guildId, userId, at }) {
  const result = db
    .prepare(
      `
    INSERT INTO verification_state (
      guild_id,
      user_id,
      verify_fails,
      status,
      last_action_at
    )
    VALUES (?, ?, 0, 'pending', ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      verify_fails = 0,
      status = 'pending',
      deadline_at = NULL,
      last_action_at = excluded.last_action_at
  `
    )
    .run(guildId, userId, at);

  return result?.changes || 0;
}

function upsertProtectedPrincipal(
  db,
  { guildId, userId, currentName, active, addedBy, notes, at }
) {
  db.prepare(
    `
    INSERT INTO protected_principals (
      guild_id,
      user_id,
      current_name,
      active,
      added_by,
      notes,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      current_name = excluded.current_name,
      active = excluded.active,
      added_by = excluded.added_by,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `
  ).run(
    guildId,
    userId,
    currentName || null,
    active ? 1 : 0,
    addedBy || null,
    notes || null,
    at,
    at
  );
}

function updateProtectedPrincipalName(db, { guildId, userId, currentName, at }) {
  db.prepare(
    `
    UPDATE protected_principals
    SET current_name = ?, updated_at = ?
    WHERE guild_id = ? AND user_id = ?
  `
  ).run(currentName || null, at, guildId, userId);
}

function getProtectedPrincipals(db, guildId) {
  return db
    .prepare(
      `
    SELECT guild_id, user_id, current_name, active, added_by, notes, created_at, updated_at
    FROM protected_principals
    WHERE guild_id = ?
    ORDER BY active DESC, updated_at DESC
  `
    )
    .all(guildId);
}

function getProtectedPrincipal(db, { guildId, userId }) {
  return db
    .prepare(
      `
    SELECT guild_id, user_id, current_name, active, added_by, notes, created_at, updated_at
    FROM protected_principals
    WHERE guild_id = ? AND user_id = ?
    LIMIT 1
  `
    )
    .get(guildId, userId);
}

function getActiveProtectedPrincipals(db, guildId) {
  return db
    .prepare(
      `
    SELECT guild_id, user_id, current_name, active, added_by, notes, created_at, updated_at
    FROM protected_principals
    WHERE guild_id = ? AND active = 1
    ORDER BY updated_at DESC
  `
    )
    .all(guildId);
}

function isActiveProtectedPrincipal(db, { guildId, userId }) {
  const row = db
    .prepare(
      `
    SELECT 1 AS found
    FROM protected_principals
    WHERE guild_id = ? AND user_id = ? AND active = 1
    LIMIT 1
  `
    )
    .get(guildId, userId);
  return Boolean(row?.found);
}

function getAlertThrottle(db, key) {
  return db
    .prepare(
      `
    SELECT key, last_sent_at
    FROM alert_throttle
    WHERE key = ?
  `
    )
    .get(key);
}

function setAlertThrottle(db, { key, at }) {
  db.prepare(
    `
    INSERT INTO alert_throttle (key, last_sent_at)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      last_sent_at = excluded.last_sent_at
  `
  ).run(key, at);
}

function getAlertThrottleByPrefix(db, prefix) {
  return db
    .prepare(
      `
    SELECT key, last_sent_at
    FROM alert_throttle
    WHERE key LIKE ?
  `
    )
    .all(`${prefix}%`);
}

function deleteAlertThrottle(db, key) {
  db.prepare(
    `
    DELETE FROM alert_throttle
    WHERE key = ?
  `
  ).run(key);
}

module.exports = {
  initSchema,
  upsertPending,
  getState,
  getDuePending,
  setVerified,
  setJailed,
  setKicked,
  setBanned,
  setLeft,
  deferPending,
  logModeration,
  resetFails,
  setRulesMessage,
  getRulesMessage,
  setFaqMessage,
  getFaqMessage,
  setQuickStartMessage,
  getQuickStartMessage,
  upsertMessageCache,
  getMessageCache,
  deleteExpiredMessageCache,
  getMessageCacheByAuthorSince,
  setStatus,
  upsertProtectedPrincipal,
  updateProtectedPrincipalName,
  getProtectedPrincipal,
  getProtectedPrincipals,
  getActiveProtectedPrincipals,
  isActiveProtectedPrincipal,
  getAlertThrottle,
  setAlertThrottle,
  getAlertThrottleByPrefix,
  deleteAlertThrottle,
  getWelcomeState,
  setWelcomeState,
};
