// ./utils/modLogFilters.js
const { config } = require("../config/botConfig");

function shouldSkipChannel(channel) {
  if (!channel) return true;
  if (channel.id === config.adminLogChannelId) return true;
  if (config.excludedChannelIds.includes(channel.id)) return true;
  if (channel.parentId && config.excludedCategoryIds.includes(channel.parentId)) {
    return true;
  }
  return false;
}

module.exports = { shouldSkipChannel };
