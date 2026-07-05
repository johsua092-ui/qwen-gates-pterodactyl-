/**
 * Account Pool — round-robin rotation with smart selection.
 * CommonJS, file-based storage (data/accounts.json).
 */
const fs = require("node:fs");
const path = require("node:path");

const DATA_FILE = path.join(__dirname, "..", "data", "accounts.json");

function loadAccounts() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2));
}

let lastIndex = 0;

/**
 * Add a new account to the pool.
 * @param {object} opts - { provider, email, credential, credentialType }
 * credentialType: "cookie" | "token" | "session_key"
 */
function addAccount({ provider, email, credential, credentialType = "cookie" }) {
  const accounts = loadAccounts();
  const id = `${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const account = {
    id,
    provider,
    email: email || "",
    credential,
    credentialType,
    authStatus: "authenticated",
    inFlight: 0,
    totalReqs: 0,
    throttleStatus: "ok",
    disabled: false,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    cooldownUntil: null,
    notes: "",
  };
  accounts.push(account);
  saveAccounts(accounts);
  return account;
}

/**
 * Remove an account by ID.
 */
function removeAccount(id) {
  const accounts = loadAccounts();
  const filtered = accounts.filter((a) => a.id !== id);
  saveAccounts(filtered);
  return filtered.length < accounts.length;
}

/**
 * Toggle an account's disabled status.
 */
function toggleAccount(id, disabled) {
  const accounts = loadAccounts();
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return null;
  acc.disabled = disabled;
  saveAccounts(accounts);
  return acc;
}

/**
 * Get next available account for a provider using round-robin.
 * Skips: disabled, cooldown, overloaded accounts.
 * Returns null if no account is available.
 */
function getNextAccount(provider, maxConcurrent = 3) {
  const accounts = loadAccounts();
  const eligible = accounts.filter((a) => {
    if (a.provider !== provider) return false;
    if (a.disabled) return false;
    if (a.throttleStatus === "cooldown" && a.cooldownUntil && new Date(a.cooldownUntil) > new Date()) return false;
    if (a.inFlight >= maxConcurrent) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const idx = lastIndex % eligible.length;
  lastIndex++;

  const chosen = eligible[idx];
  chosen.inFlight++;
  chosen.totalReqs++;
  chosen.lastUsed = new Date().toISOString();
  saveAccounts(accounts);
  return chosen;
}

/**
 * Release an account after request completes.
 */
function releaseAccount(id) {
  const accounts = loadAccounts();
  const acc = accounts.find((a) => a.id === id);
  if (acc) {
    acc.inFlight = Math.max(0, acc.inFlight - 1);
    saveAccounts(accounts);
  }
}

/**
 * Put an account on cooldown.
 */
function cooldownAccount(id, durationMs = 60000) {
  const accounts = loadAccounts();
  const acc = accounts.find((a) => a.id === id);
  if (acc) {
    acc.throttleStatus = "cooldown";
    acc.cooldownUntil = new Date(Date.now() + durationMs).toISOString();
    acc.inFlight = Math.max(0, acc.inFlight - 1);
    saveAccounts(accounts);
  }
}

/**
 * Get all accounts (for dashboard/monitoring).
 */
function getAllAccounts() {
  return loadAccounts();
}

/**
 * Get accounts filtered by provider.
 */
function getAccountsByProvider(provider) {
  return loadAccounts().filter((a) => a.provider === provider);
}

module.exports = {
  loadAccounts,
  saveAccounts,
  addAccount,
  removeAccount,
  toggleAccount,
  getNextAccount,
  releaseAccount,
  cooldownAccount,
  getAllAccounts,
  getAccountsByProvider,
};
