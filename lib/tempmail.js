/**
 * Temp Mail client — uses mail.tm API for disposable email addresses.
 * No API key required, free tier available.
 * CommonJS, zero native deps.
 */

const MAIL_TM = "https://api.mail.tm";

let cachedDomain = null;

async function getDomain() {
  if (cachedDomain) return cachedDomain;
  const res = await fetch(`${MAIL_TM}/domains`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`mail.tm domains failed: ${res.status}`);
  const data = await res.json();
  const list = data["hydra:member"] || data;
  const active = list.find((d) => d.isActive) || list[0];
  if (!active) throw new Error("No active mail.tm domain found");
  cachedDomain = active.domain;
  return cachedDomain;
}

function randomString(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Create a new temp mailbox.
 * Returns { address, password, id, token }
 */
async function createMailbox() {
  const domain = await getDomain();
  const address = `${randomString(12)}@${domain}`;
  const password = randomString(16);

  // Create account
  const createRes = await fetch(`${MAIL_TM}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`mail.tm create failed (${createRes.status}): ${text}`);
  }

  const account = await createRes.json();

  // Get auth token
  const tokenRes = await fetch(`${MAIL_TM}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!tokenRes.ok) {
    throw new Error(`mail.tm token failed: ${tokenRes.status}`);
  }

  const { token } = await tokenRes.json();

  return {
    address,
    password,
    id: account.id,
    token,
  };
}

/**
 * Get messages for a mailbox.
 * @param {string} token - auth token from createMailbox
 * @returns {Array} list of messages
 */
async function getMessages(token) {
  const res = await fetch(`${MAIL_TM}/messages`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`mail.tm messages failed: ${res.status}`);
  const data = await res.json();
  return data["hydra:member"] || data;
}

/**
 * Get a single message by ID (full content).
 */
async function getMessage(token, messageId) {
  const res = await fetch(`${MAIL_TM}/messages/${messageId}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`mail.tm message failed: ${res.status}`);
  return res.json();
}

/**
 * Poll for a message matching a pattern (subject or from).
 * @param {string} token - auth token
 * @param {object} opts - { subjectContains, fromContains, maxWait, pollInterval }
 * @returns {object|null} message or null if timeout
 */
async function waitForMessage(token, opts = {}) {
  const {
    subjectContains = "",
    fromContains = "",
    maxWait = 120000,
    pollInterval = 5000,
  } = opts;

  const start = Date.now();
  const seen = new Set();

  while (Date.now() - start < maxWait) {
    const messages = await getMessages(token);
    for (const msg of messages) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);

      const matchSubject =
        !subjectContains || (msg.subject || "").toLowerCase().includes(subjectContains.toLowerCase());
      const matchFrom =
        !fromContains || (msg.from?.address || "").toLowerCase().includes(fromContains.toLowerCase());

      if (matchSubject && matchFrom) {
        return getMessage(token, msg.id);
      }
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return null;
}

/**
 * Extract verification link from message HTML/text.
 */
function extractVerificationLink(message, urlPattern) {
  const text = [message.html?.join("\n") || "", message.text || ""].join("\n");
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const urls = text.match(urlRegex) || [];

  if (urlPattern) {
    return urls.find((u) => u.includes(urlPattern)) || null;
  }

  // Common verification patterns
  const verifyUrl = urls.find(
    (u) =>
      u.includes("verify") ||
      u.includes("confirm") ||
      u.includes("activate") ||
      u.includes("token=") ||
      u.includes("code=")
  );

  return verifyUrl || urls[0] || null;
}

/**
 * Extract verification code (4-8 digit number) from message.
 */
function extractVerificationCode(message) {
  const text = [message.html?.join("\n") || "", message.text || ""].join("\n");
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}

module.exports = {
  createMailbox,
  getMessages,
  getMessage,
  waitForMessage,
  extractVerificationLink,
  extractVerificationCode,
};
