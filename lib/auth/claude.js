/**
 * Claude auth provider — register + login via claude.ai.
 * Claude uses Anthropic's auth system with email magic links.
 * CommonJS, no native deps.
 */

const BASE = "https://claude.ai";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Request magic link for Claude login/register.
 * Claude doesn't have a traditional register — it uses magic links.
 *
 * @param {string} email
 * @returns {{ step: "magic_link_sent", email }}
 */
async function registerStart(email) {
  const res = await fetch(`${BASE}/api/auth/send_magic_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude magic-link failed (${res.status}): ${text}`);
  }

  return { step: "magic_link_sent", email };
}

/**
 * Exchange magic link token for session.
 * The magic link contains a token in the URL — user clicks it,
 * then we extract the session cookie.
 *
 * @param {string} magicLinkToken - token from the magic link URL
 * @returns {{ sessionKey: string }}
 */
async function completeMagicLink(magicLinkToken) {
  // Follow the magic link redirect to get session cookie
  const res = await fetch(`${BASE}/api/auth/verify_magic_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({ token: magicLinkToken }),
    redirect: "manual",
  });

  const setCookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = setCookies.find((c) => c.startsWith("sessionKey="));

  if (!sessionCookie) {
    throw new Error("Claude magic link: no sessionKey cookie in response");
  }

  const sessionKey = sessionCookie.split("=")[1].split(";")[0];
  return { sessionKey };
}

/**
 * Login using OAuth flow (alternative to magic link).
 * This extracts the session from an existing browser session.
 *
 * @param {string} sessionKey - existing session key cookie
 * @returns {{ sessionKey: string }}
 */
async function login(sessionKey) {
  const valid = await validateSession(sessionKey);
  if (!valid) {
    throw new Error("Claude session key is invalid or expired");
  }
  return { sessionKey };
}

/**
 * Validate a session key is still working.
 */
async function validateSession(sessionKey) {
  try {
    const res = await fetch(`${BASE}/api/organizations`, {
      headers: {
        "User-Agent": UA,
        Cookie: `sessionKey=${sessionKey}`,
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  provider: "claude",
  registerStart,
  completeMagicLink,
  login,
  validateSession,
};
