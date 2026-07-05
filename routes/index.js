import express from "express";
import { isValidKey } from "../utils/auth.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createScraper, listProviders } = require("../scrapers/index.js");
const pool = require("../lib/pool.js");
const monitor = require("../lib/monitor.js");

const router = express.Router();

// --- Auth middleware ---
function checkAuth(req, res, next) {
  const key =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.query.api_key ||
    "";
  if (process.env.GATEWAY_KEY && !isValidKey(key)) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  next();
}

// --- Model → provider mapping ---
const MODEL_MAP = {
  "qwen3-max": "qwen",
  "qwen3-max-thinking": "qwen",
  "qwen-max": "qwen",
  "qwen-plus": "qwen",
  "qwen-turbo": "qwen",
  "qwen3.7-plus": "qwen",
  "kimi": "kimi",
  "kimi-2.7-coder": "kimi",
  "moonshot-v1-8k": "kimi",
  "moonshot-v1-32k": "kimi",
  "claude-3-5-sonnet": "claude",
  "claude-3-5-sonnet-20241022": "claude",
  "claude-sonnet-4-20250514": "claude",
  "claude-3-5-haiku": "claude",
  "claude-3-5-haiku-20241022": "claude",
  "claude-opus-4-8-20250625": "claude",
  "claude-opus-4.8": "claude",
};

function resolveProvider(model) {
  if (!model) return null;
  if (MODEL_MAP[model]) return MODEL_MAP[model];
  const m = model.toLowerCase();
  if (m.includes("qwen")) return "qwen";
  if (m.includes("moonshot") || m.includes("kimi")) return "kimi";
  if (m.includes("claude")) return "claude";
  return null;
}

// ============================================================
// GET /v1/models — list available models
// ============================================================
router.get("/v1/models", checkAuth, (req, res) => {
  const models = Object.keys(MODEL_MAP);
  res.json({
    object: "list",
    data: models.map((id) => ({
      id,
      object: "model",
      owned_by: MODEL_MAP[id],
    })),
  });
});

// ============================================================
// POST /v1/chat/completions — main endpoint (scraper + rotation)
// ============================================================
router.post("/v1/chat/completions", checkAuth, async (req, res) => {
  const body = req.body || {};
  const providerName = resolveProvider(body.model);

  if (!providerName) {
    return res.status(400).json({
      error: { message: `Unknown or unsupported model: ${body.model}` },
    });
  }

  const account = pool.getNextAccount(providerName);

  if (!account) {
    return res.status(429).json({
      error: {
        message: `No available ${providerName} accounts. Add accounts via POST /accounts`,
        retry_after: 60,
      },
    });
  }

  const accountId = account.id;

  try {
    const scraper = createScraper(providerName, account.credential);
    const messages = body.messages || [];
    const stream = !!body.stream;
    const model = body.model;

    if (stream) {
      await scraper.chat(messages, model, true, res);
      monitor.recordRequest(providerName, true);
      pool.releaseAccount(accountId);
      return;
    }

    const result = await scraper.chat(messages, model, false, res);
    monitor.recordRequest(providerName, true);
    pool.releaseAccount(accountId);
    return res.json(result);
  } catch (err) {
    console.error(`[${providerName}] Error:`, err.message);
    monitor.recordRequest(providerName, false);

    if (
      err.message?.includes("429") ||
      err.message?.includes("rate") ||
      err.message?.includes("limit")
    ) {
      pool.cooldownAccount(accountId, 120000);
    } else {
      pool.releaseAccount(accountId);
    }

    if (!res.headersSent) {
      res.status(500).json({ error: { message: String(err.message || err) } });
    } else {
      res.end();
    }
  }
});

// ============================================================
// Account Management API
// ============================================================

router.get("/accounts", checkAuth, (req, res) => {
  const accounts = pool.getAllAccounts();
  const sanitized = accounts.map((a) => ({
    ...a,
    credential: a.credential
      ? a.credential.slice(0, 20) + "..." + a.credential.slice(-10)
      : "",
  }));
  res.json({ accounts: sanitized, total: sanitized.length });
});

router.post("/accounts", checkAuth, (req, res) => {
  const { provider, email, credential, credentialType } = req.body || {};

  if (!provider || !credential) {
    return res.status(400).json({
      error: { message: "provider and credential are required" },
    });
  }

  const account = pool.addAccount({
    provider,
    email: email || "",
    credential,
    credentialType: credentialType || "cookie",
  });

  res.status(201).json({ status: true, account });
});

router.delete("/accounts/:id", checkAuth, (req, res) => {
  const removed = pool.removeAccount(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: { message: "Account not found" } });
  }
  res.json({ status: true, message: "Account removed" });
});

router.patch("/accounts/:id/toggle", checkAuth, (req, res) => {
  const { disabled } = req.body || {};
  const account = pool.toggleAccount(req.params.id, !!disabled);
  if (!account) {
    return res.status(404).json({ error: { message: "Account not found" } });
  }
  res.json({ status: true, account });
});

// ============================================================
// Monitor / Stats API
// ============================================================

router.get("/monitor/stats", checkAuth, (req, res) => {
  const stats = monitor.getStats();
  const accounts = pool.getAllAccounts();
  const byProvider = {};
  for (const a of accounts) {
    if (!byProvider[a.provider]) byProvider[a.provider] = [];
    byProvider[a.provider].push(a);
  }
  res.json({
    ...stats,
    accounts: {
      total: accounts.length,
      active: accounts.filter((a) => !a.disabled).length,
      disabled: accounts.filter((a) => a.disabled).length,
      byProvider,
    },
  });
});

router.get("/monitor/providers", checkAuth, (req, res) => {
  res.json({ providers: listProviders() });
});

export default router;
