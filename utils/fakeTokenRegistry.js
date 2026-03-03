const { config } = require("../config/botConfig");

const CACHE_TTL_MS = 60 * 1000;
let cache = {
  fetchedAt: 0,
  addresses: null,
};

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAddressList(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Fake token payload must be a JSON array.");
  }
  const addresses = new Set();
  for (const item of payload) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    if (!normalized.startsWith("0x")) continue;
    addresses.add(normalized);
  }
  return addresses;
}

async function getFakeTokenAddressSet() {
  const now = Date.now();
  if (cache.addresses && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.addresses;
  }

  const response = await fetchWithTimeout(
    config.fakeTokenAddressesUrl,
    config.fakeTokenCheckTimeoutMs
  );
  if (!response.ok) {
    throw new Error(`Fake token endpoint returned ${response.status}`);
  }

  const payload = await response.json();
  const addresses = parseAddressList(payload);
  cache = {
    fetchedAt: now,
    addresses,
  };
  return addresses;
}

async function classifyAddress(lowerAddress) {
  try {
    const addresses = await getFakeTokenAddressSet();
    if (addresses.has(lowerAddress)) {
      return "fraud";
    }
    return "clean";
  } catch {
    return "unavailable";
  }
}

module.exports = {
  classifyAddress,
};
