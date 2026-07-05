/**
 * Kimi/Moonshot auth provider — register + login via kimi.moonshot.cn API.
 * CommonJS, no native deps.
 */

const BASE = "https://kimi.moonshot.cn";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Request SMS/email verification code for registration.
 *
 * @param {string} email
 * @returns {{ step: "code_sent", email }}
 */
async function registerStart(email) {
  const res = await fetch(`${BASE}/api/auth/email/send-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: "https://kimi.com",
      Referer: "https://kimi.com/",
    },
    body: JSON.stringify({
      email,
      type: "register",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kimi send-code failed (${res.status}): ${text}`);
  }

  return { step: "code_sent", email };
}

/**
 * Complete registration with verification code.
 *
 * @param {string} email
 * @param {string} code
 * @returns {{ token: string }}
 */
async function registerComplete(email, code) {
  const res = await fetch(`${BASE}/api/auth/email/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: "https://kimi.com",
      Referer: "https://kimi.com/",
    },
    body: JSON.stringify({
      email,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kimi register failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const token = data.access_token || data.token || data.data?.access_token;

  if (!token) {
    throw new Error("Kimi register: no token in response");
  }

  return { token };
}

/**
 * Login with email + password (if set) or email + code.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ token: string }}
 */
async function login(email, password) {
  // Try password login first
  const res = await fetch(`${BASE}/api/auth/email/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: "https://kimi.com",
      Referer: "https://kimi.com/",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kimi login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const token = data.access_token || data.token || data.data?.access_token;

  if (!token) {
    throw new Error("Kimi login: no token in response");
  }

  return { token };
}

/**
 * Validate a token is still working.
 */
async function validateToken(token) {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
        Referer: "https://kimi.com/",
      },
    });
    return res.ok || res.status === 404; // 404 = auth ok, no chats yet
  } catch {
    return false;
  }
}

module.exports = {
  provider: "kimi",
  registerStart,
  registerComplete,
  login,
  validateToken,
};
