import express from "express";
import { isValidKey } from "../utils/auth.js";
import { handleOpenAI } from "../adapters/openai.js";
import { handleAnthropic } from "../adapters/anthropic.js";

const router = express.Router();

const PROVIDERS = {
  qwen: {
    baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.QWEN_API_KEY || "",
    type: "openai",
  },
  glm: {
    baseUrl: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
    apiKey: process.env.GLM_API_KEY || "",
    type: "openai",
  },
  claude: {
    baseUrl: process.env.CLAUDE_BASE_URL || "https://api.anthropic.com/v1",
    apiKey: process.env.CLAUDE_API_KEY || "",
    type: "anthropic",
  },
  moonshot: {
    baseUrl: process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1",
    apiKey: process.env.MOONSHOT_API_KEY || "",
    type: "openai",
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    type: "openai",
  }
};

function resolveProvider(model = "") {
  const m = String(model).toLowerCase();
  if (m.includes("/")) {
    const p = m.split("/")[0];
    if (PROVIDERS[p]) return p;
  }
  if (m.startsWith("qwen")) return "qwen";
  if (m.startsWith("glm")) return "glm";
  if (m.startsWith("claude")) return "claude";
  if (m.startsWith("moonshot") || m.startsWith("kimi")) return "moonshot";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  return null;
}

function stripPrefix(model) {
  return String(model).includes("/") ? String(model).split("/").slice(1).join("/") : model;
}

// Authentication middleware
function checkAuth(req, res, next) {
  // If no auth keys configured, bypass
  if (!process.env.GATEWAY_KEY && false /* check if JSON has no keys too? Let's just use isValidKey */) {
    // Actually, let's always require auth if keys exist, or if GATEWAY_KEY is set.
    // If no keys exist and GATEWAY_KEY is empty, we allow. But let's simplify:
  }
  
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  
  if (!token) {
    return res.status(401).json({ error: { message: "Missing API key" } });
  }
  
  if (!isValidKey(token)) {
    return res.status(401).json({ error: { message: "Invalid API key" } });
  }
  next();
}

router.get("/v1/models", checkAuth, (req, res) => {
  const ids = [
    "qwen-plus", "qwen-max", "qwen-turbo",
    "glm-4-plus", "glm-4", "glm-4-flash", "glm-5.2",
    "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
    "claude-3-7-sonnet", "claude-3-5-fable", "claude-4-8-opus",
    "moonshot-v1-8k", "moonshot-v1-32k", "kimi-2.7-coder",
    "gpt-4o", "gpt-5.5"
  ];
  res.json({
    object: "list",
    data: ids.map((id) => ({ id, object: "model", owned_by: resolveProvider(id) })),
  });
});

router.post("/v1/chat/completions", checkAuth, async (req, res) => {
  const body = req.body || {};
  const providerName = resolveProvider(body.model);
  if (!providerName) {
    return res.status(400).json({ error: { message: `Unknown model: ${body.model}` } });
  }
  const provider = PROVIDERS[providerName];
  if (!provider.apiKey) {
    return res.status(500).json({ error: { message: `${providerName} API key belum di-set` } });
  }
  
  // Custom mapping for specific requested models
  let model = stripPrefix(body.model);
  if (model === "kimi-2.7-coder") model = "moonshot-v1-32k"; // fallback map if needed
  if (model === "claude-5-sonnet") model = "claude-3-5-sonnet-20241022"; // map
  if (model === "glm5.2") model = "glm-4-plus"; // map

  try {
    if (provider.type === "openai") {
      return await handleOpenAI(provider, { ...body, model }, res);
    }
    return await handleAnthropic(provider, { ...body, model }, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: { message: String(err) } });
    else res.end();
  }
});

export default router;
