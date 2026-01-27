// ./utils/modLogSuppress.js
const recentBulkDeletes = [];
const suppressedBulkUsers = new Map();

function now() {
  return Date.now();
}

function recordBulkDelete(channelId, count) {
  recentBulkDeletes.push({ channelId, count, at: now() });
  prune();
}

function isRecentBulkDelete(channelId, count, windowMs = 10000) {
  const cutoff = now() - windowMs;
  return recentBulkDeletes.some(
    (entry) =>
      entry.at >= cutoff &&
      entry.channelId === channelId &&
      entry.count === count
  );
}

function suppressBulkForUser(userId, ttlMs = 10000) {
  suppressedBulkUsers.set(userId, now() + ttlMs);
}

function isBulkSuppressedForUser(userId) {
  const expiry = suppressedBulkUsers.get(userId);
  if (!expiry) return false;
  if (expiry < now()) {
    suppressedBulkUsers.delete(userId);
    return false;
  }
  return true;
}

function prune() {
  const cutoff = now() - 15000;
  while (recentBulkDeletes.length > 0 && recentBulkDeletes[0].at < cutoff) {
    recentBulkDeletes.shift();
  }
  for (const [userId, expiry] of suppressedBulkUsers.entries()) {
    if (expiry < now()) suppressedBulkUsers.delete(userId);
  }
}

module.exports = {
  recordBulkDelete,
  isRecentBulkDelete,
  suppressBulkForUser,
  isBulkSuppressedForUser,
};
