// ./utils/messageCache.js
const MAX_ENTRIES = Number.parseInt(process.env.MESSAGE_CACHE_MAX, 10);
const TTL_MS =
  Number.parseInt(process.env.MESSAGE_CACHE_TTL_HOURS, 10) * 60 * 60 * 1000;
const DB_ENABLED =
  process.env.MESSAGE_CACHE_DB_ENABLED.toLowerCase() === "true";
const DB_TTL_MS =
  Number.parseInt(process.env.MESSAGE_CACHE_DB_TTL_HOURS, 10) * 60 * 60 * 1000;

const cache = new Map();
const order = [];
let db = null;
let cleanupTimer = null;

const {
  upsertMessageCache,
  getMessageCache,
  deleteExpiredMessageCache,
  getMessageCacheByAuthorSince,
} = require("../db/queries");

function now() {
  return Date.now();
}

function prune() {
  const cutoff = now() - TTL_MS;
  while (order.length > 0) {
    const id = order[0];
    const entry = cache.get(id);
    if (!entry || entry.createdAt < cutoff) {
      order.shift();
      cache.delete(id);
      continue;
    }
    break;
  }

  while (order.length > MAX_ENTRIES) {
    const id = order.shift();
    cache.delete(id);
  }
}

function setMessage(message) {
  if (!message?.id) return;
  const attachments = [];
  if (message.attachments?.size) {
    for (const attachment of message.attachments.values()) {
      if (attachment?.url) attachments.push(attachment.url);
    }
  }

  const entry = {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || null,
    content: message.content || "",
    attachments,
    createdAt: now(),
  };

  cache.set(message.id, entry);
  order.push(message.id);
  prune();

  if (DB_ENABLED && db) {
    try {
      upsertMessageCache(db, {
        ...entry,
        attachments: JSON.stringify(entry.attachments),
      });
    } catch {
      // ignore DB cache write failures
    }
  }
}

function getMessage(messageId) {
  const cached = cache.get(messageId);
  if (cached) return cached;

  if (DB_ENABLED && db) {
    try {
      const row = getMessageCache(db, messageId);
      if (!row) return null;
      const attachments = safeParseArray(row.attachments);
      return {
        id: row.message_id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        authorId: row.author_id,
        authorTag: row.author_tag,
        content: row.content || "",
        attachments,
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }

  return null;
}

function initMessageCacheDb(dbInstance) {
  if (!DB_ENABLED || !dbInstance) return;
  db = dbInstance;

  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = setInterval(() => {
    try {
      deleteExpiredMessageCache(db, now() - DB_TTL_MS);
    } catch {
      // ignore cleanup errors
    }
  }, Math.min(DB_TTL_MS, 60 * 60 * 1000));
}

function safeParseArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  setMessage,
  getMessage,
  initMessageCacheDb,
  getRecentMessagesByAuthor: (authorId, sinceMs, limit = 50) => {
    const merged = new Map();

    for (const entry of cache.values()) {
      if (entry.authorId !== authorId) continue;
      if (entry.createdAt < sinceMs) continue;
      merged.set(entry.id, entry);
    }

    if (DB_ENABLED && db) {
      try {
        const rows = getMessageCacheByAuthorSince(db, {
          authorId,
          since: sinceMs,
          limit,
        });
        for (const row of rows) {
          if (merged.has(row.message_id)) continue;
          merged.set(row.message_id, {
            id: row.message_id,
            guildId: row.guild_id,
            channelId: row.channel_id,
            authorId: row.author_id,
            authorTag: row.author_tag,
            content: row.content || "",
            attachments: safeParseArray(row.attachments),
            createdAt: row.created_at,
          });
        }
      } catch {
        // ignore DB cache read failures
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
};
