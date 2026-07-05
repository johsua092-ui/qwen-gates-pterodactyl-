/**
 * Scraper Registry — maps providers to their scraper classes.
 * Each scraper uses cookie/token auth (no API keys).
 */
const { QwenScraper } = require("./qwen");
const { KimiScraper } = require("./kimi");
const { ClaudeScraper } = require("./claude");

const REGISTRY = {
  qwen: {
    name: "Qwen",
    ScraperClass: QwenScraper,
    credentialType: "cookie",
    description: "Scrapes chat.qwen.ai via cookie auth",
  },
  kimi: {
    name: "Kimi/Moonshot",
    ScraperClass: KimiScraper,
    credentialType: "token",
    description: "Scrapes kimi.moonshot.cn via Bearer token",
  },
  claude: {
    name: "Claude",
    ScraperClass: ClaudeScraper,
    credentialType: "session_key",
    description: "Scrapes claude.ai via session cookie",
  },
};

/**
 * Create a scraper instance from an account's credential.
 * @param {string} provider - provider name (qwen, kimi, claude)
 * @param {string} credential - cookie/token/session_key
 * @returns {object} scraper instance with .chat() method
 */
function createScraper(provider, credential) {
  const entry = REGISTRY[provider];
  if (!entry) {
    throw new Error(`Unknown scraper provider: ${provider}`);
  }
  return new entry.ScraperClass(credential);
}

/**
 * Get list of registered providers.
 */
function listProviders() {
  return Object.entries(REGISTRY).map(([key, val]) => ({
    provider: key,
    name: val.name,
    credentialType: val.credentialType,
    description: val.description,
  }));
}

module.exports = { REGISTRY, createScraper, listProviders };
