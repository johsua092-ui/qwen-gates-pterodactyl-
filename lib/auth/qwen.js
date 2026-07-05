/**
 * Qwen auth provider — register + login via chat.qwen.ai internal API.
 * CommonJS, no native deps.
 */

const BASE = "https://chat.qwen.ai";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Register a new Qwen account using email + password.
 * Qwen uses Alibaba Cloud auth — send verification code to email first.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ step: "code_sent", email }}
 */
async function registerStart(email, password) {
  // Step 1: Request verification code
  const res = await fetch(`${BASE}/api/v1/auths/email/send-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      email,
      scene: "register",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qwen send-code failed (${res.status}): ${text}`);
  }

  return { step: "code_sent", email, password };
}

/**
 * Complete registration with verification code.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} code - verification code from email
 * @returns {{ cookie: string }}
 */
async function registerComplete(email, password, code) {
  const res = await fetch(`${BASE}/api/v1/auths/email/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      email,
      password,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qwen register failed (${res.status}): ${text}`);
  }

  // Extract cookies from response
  const setCookies = res.headers.getSetCookie?.() || [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

  if (!cookie) {
    // Try to get cookie from a follow-up login
    return login(email, password);
  }

  return { cookie };
}

/**
 * Login with existing Qwen account.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ cookie: string }}
 */
async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auths/email/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qwen login failed (${res.status}): ${text}`);
  }

  const setCookies = res.headers.getSetCookie?.() || [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

  if (!cookie) {
    const data = await res.json().catch(() => ({}));
    if (data.data?.token) {
      return { cookie: `token=${data.data.token}` };
    }
    throw new Error("Qwen login: no cookie or token in response");
  }

  return { cookie };
}

/**
 * Validate a cookie is still working.
 */
async function validateCookie(cookie) {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Origin: BASE,
        Referer: `${BASE}/`,
        Cookie: cookie,
      },
      body: JSON.stringify({ title: "test" }),
    });
    return res.ok || res.status === 400; // 400 = auth ok, bad request body
  } catch {
    return false;
  }
}

module.exports = {
  provider: "qwen",
  registerStart,
  registerComplete,
  login,
  validateCookie,
};
