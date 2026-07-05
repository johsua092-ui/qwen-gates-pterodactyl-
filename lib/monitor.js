/**
 * Monitor — lightweight in-memory metrics for the gateway.
 * Tracks per-provider and global request stats.
 */

const stats = {
  totalRequests: 0,
  totalErrors: 0,
  startTime: Date.now(),
  byProvider: {},
};

function recordRequest(provider, success = true) {
  stats.totalRequests++;
  if (!success) stats.totalErrors++;

  if (!stats.byProvider[provider]) {
    stats.byProvider[provider] = { requests: 0, errors: 0 };
  }
  stats.byProvider[provider].requests++;
  if (!success) stats.byProvider[provider].errors++;
}

function getStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  return {
    uptime,
    totalRequests: stats.totalRequests,
    totalErrors: stats.totalErrors,
    byProvider: stats.byProvider,
  };
}

function resetStats() {
  stats.totalRequests = 0;
  stats.totalErrors = 0;
  stats.startTime = Date.now();
  stats.byProvider = {};
}

module.exports = { recordRequest, getStats, resetStats };
