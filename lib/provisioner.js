/**
 * Provisioner — orchestrates full account lifecycle:
 * 1. Generate temp email
 * 2. Register on provider
 * 3. Auto-verify email
 * 4. Login & get token/cookie
 * 5. Inject into account pool
 *
 * CommonJS, uses lib/tempmail.js + lib/auth/*.js + lib/pool.js
 */

const tempmail = require("./tempmail");
const pool = require("./pool");

const AUTH_PROVIDERS = {
  qwen: () => require("./auth/qwen"),
  kimi: () => require("./auth/kimi"),
  claude: () => require("./auth/claude"),
};

/**
 * Full auto-provision: create email → register → verify → login → pool.
 *
 * @param {string} provider - "qwen" | "kimi" | "claude"
 * @param {object} opts - { onProgress }
 * @returns {{ account, email, credential }}
 */
async function provision(provider, opts = {}) {
  const { onProgress = () => {} } = opts;

  const getAuth = AUTH_PROVIDERS[provider];
  if (!getAuth) {
    throw new Error(`Unknown provider: ${provider}. Available: ${Object.keys(AUTH_PROVIDERS).join(", ")}`);
  }
  const auth = getAuth();

  // Step 1: Generate temp email
  onProgress("mailbox", "Creating temp mailbox...");
  const mailbox = await tempmail.createMailbox();
  const email = mailbox.address;
  onProgress("mailbox", `Mailbox ready: ${email}`);

  // Step 2: Start registration
  onProgress("register", `Sending verification to ${email}...`);
  const password = tempmail.createMailbox.toString ? randomPw() : randomPw();

  let regState;
  if (provider === "claude") {
    regState = await auth.registerStart(email);
  } else {
    regState = await auth.registerStart(email, password);
  }
  onProgress("register", `Verification sent to ${email}`);

  // Step 3: Wait for verification email
  onProgress("verify", "Waiting for verification email...");
  let credential;

  if (provider === "qwen") {
    // Qwen sends a numeric code
    const msg = await tempmail.waitForMessage(mailbox.token, {
      fromContains: "qwen",
      subjectContains: "code",
      maxWait: 90000,
      pollInterval: 4000,
    });

    if (!msg) {
      // Fallback: try without subject filter
      const anyMsg = await tempmail.waitForMessage(mailbox.token, {
        maxWait: 30000,
        pollInterval: 3000,
      });
      if (!anyMsg) throw new Error("Qwen verification email not received (timeout)");
      const code = tempmail.extractVerificationCode(anyMsg);
      if (!code) throw new Error("Could not extract verification code from email");
      const result = await auth.registerComplete(email, password, code);
      credential = result.cookie;
    } else {
      const code = tempmail.extractVerificationCode(msg);
      if (!code) throw new Error("Could not extract verification code from Qwen email");
      onProgress("verify", `Code extracted: ${code.slice(0, 3)}...`);
      const result = await auth.registerComplete(email, password, code);
      credential = result.cookie;
    }
  } else if (provider === "kimi") {
    // Kimi sends a numeric code
    const msg = await tempmail.waitForMessage(mailbox.token, {
      fromContains: "kimi",
      maxWait: 90000,
      pollInterval: 4000,
    });

    if (!msg) {
      const anyMsg = await tempmail.waitForMessage(mailbox.token, {
        maxWait: 30000,
        pollInterval: 3000,
      });
      if (!anyMsg) throw new Error("Kimi verification email not received (timeout)");
      const code = tempmail.extractVerificationCode(anyMsg);
      if (!code) throw new Error("Could not extract verification code from email");
      const result = await auth.registerComplete(email, code);
      credential = result.token;
    } else {
      const code = tempmail.extractVerificationCode(msg);
      if (!code) throw new Error("Could not extract verification code from Kimi email");
      onProgress("verify", `Code extracted: ${code.slice(0, 3)}...`);
      const result = await auth.registerComplete(email, code);
      credential = result.token;
    }
  } else if (provider === "claude") {
    // Claude uses magic link
    const msg = await tempmail.waitForMessage(mailbox.token, {
      fromContains: "anthropic",
      subjectContains: "claude",
      maxWait: 120000,
      pollInterval: 5000,
    });

    if (!msg) {
      throw new Error("Claude magic link email not received (timeout)");
    }

    const link = tempmail.extractVerificationLink(msg, "claude.ai");
    if (!link) throw new Error("Could not extract magic link from Claude email");

    // Extract token from magic link URL
    const url = new URL(link);
    const magicToken = url.searchParams.get("token") || url.pathname.split("/").pop();
    if (!magicToken) throw new Error("Could not extract token from magic link");

    onProgress("verify", "Exchanging magic link for session...");
    const result = await auth.completeMagicLink(magicToken);
    credential = result.sessionKey;
  }

  onProgress("pool", "Injecting account into pool...");

  // Step 5: Add to pool
  const credType = provider === "qwen" ? "cookie"
    : provider === "kimi" ? "token"
    : "session_key";

  const account = pool.addAccount({
    provider,
    email,
    credential,
    credentialType: credType,
  });

  // Store password in notes for potential re-login
  if (provider !== "claude") {
    const accounts = pool.loadAccounts();
    const acc = accounts.find((a) => a.id === account.id);
    if (acc) {
      acc.notes = `pw:${password}|mailbox:${mailbox.token}`;
      pool.saveAccounts(accounts);
    }
  }

  onProgress("done", `Account ${email} provisioned and active in pool`);

  return {
    account: { ...account, credential: credential.slice(0, 20) + "..." },
    email,
    credential,
    password: provider !== "claude" ? password : null,
  };
}

/**
 * Re-login an existing account to refresh its credential.
 *
 * @param {string} accountId
 * @returns {{ credential: string }}
 */
async function refreshAccount(accountId) {
  const accounts = pool.loadAccounts();
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc) throw new Error(`Account ${accountId} not found`);

  const auth = AUTH_PROVIDERS[acc.provider]?.();
  if (!auth) throw new Error(`No auth module for ${acc.provider}`);

  let newCredential;

  if (acc.provider === "qwen") {
    // Extract password from notes
    const pwMatch = acc.notes?.match(/pw:([^|]+)/);
    if (!pwMatch) throw new Error("No password stored for this account");
    const result = await auth.login(acc.email, pwMatch[1]);
    newCredential = result.cookie;
  } else if (acc.provider === "kimi") {
    const pwMatch = acc.notes?.match(/pw:([^|]+)/);
    if (!pwMatch) throw new Error("No password stored for this account");
    const result = await auth.login(acc.email, pwMatch[1]);
    newCredential = result.token;
  } else if (acc.provider === "claude") {
    // Claude can't auto-refresh — needs new magic link
    throw new Error("Claude accounts need manual re-auth (magic link)");
  }

  // Update credential in pool
  acc.credential = newCredential;
  acc.authStatus = "authenticated";
  acc.throttleStatus = "ok";
  acc.cooldownUntil = null;
  pool.saveAccounts(accounts);

  return { credential: newCredential };
}

/**
 * Validate all accounts and mark expired ones.
 */
async function validateAllAccounts() {
  const accounts = pool.loadAccounts();
  const results = [];

  for (const acc of accounts) {
    const auth = AUTH_PROVIDERS[acc.provider]?.();
    if (!auth) continue;

    let valid = false;
    try {
      if (acc.provider === "qwen") {
        valid = await auth.validateCookie(acc.credential);
      } else if (acc.provider === "kimi") {
        valid = await auth.validateToken(acc.credential);
      } else if (acc.provider === "claude") {
        valid = await auth.validateSession(acc.credential);
      }
    } catch {
      valid = false;
    }

    acc.authStatus = valid ? "authenticated" : "failed";
    if (!valid) acc.disabled = true;

    results.push({
      id: acc.id,
      provider: acc.provider,
      email: acc.email,
      valid,
    });
  }

  pool.saveAccounts(accounts);
  return results;
}

function randomPw(len = 14) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

module.exports = {
  provision,
  refreshAccount,
  validateAllAccounts,
};
