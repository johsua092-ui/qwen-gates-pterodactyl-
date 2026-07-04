require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT || process.env.SERVER_PORT || "3000", 10),
  gatewayKey: process.env.GATEWAY_KEY || "",

  providers: {
    qwen: {
      apiKey: process.env.QWEN_API_KEY || "",
      baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      type: "openai",
    },
    glm: {
      apiKey: process.env.GLM_API_KEY || "",
      baseUrl: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
      type: "openai",
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || "",
      baseUrl: process.env.CLAUDE_BASE_URL || "https://api.anthropic.com/v1",
      type: "anthropic",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      type: "openai",
    },
    kimi: {
      token: process.env.KIMI_TOKEN || "",
      baseUrl: process.env.KIMI_BASE_URL || "https://kimi.moonshot.cn",
      type: "scraper",
    },
    fable: {
      apiKey: process.env.FABLE_API_KEY || "",
      baseUrl: process.env.FABLE_BASE_URL || "https://api.fable.ai/v1",
      type: "openai",
    },
  },

  scraper: {
    qwen: {
      cookie: process.env.QWEN_COOKIE || "",
      bxUmidToken: process.env.QWEN_BX_UMIDTOKEN || "",
      model: process.env.QWEN_MODEL || "qwen3.7-plus",
      chatId: process.env.QWEN_CHAT_ID || "",
      debug: process.env.QWEN_DEBUG === "1",
    },
    kimi: {
      token: process.env.KIMI_TOKEN || "",
    },
  },

  accountGateway: {
    maxConcurrentPerAccount: parseInt(process.env.MAX_CONCURRENT_PER_ACCOUNT || "3", 10),
    cooldownMs: parseInt(process.env.COOLDOWN_MS || "30000", 10),
    tokenRefreshBufferMs: parseInt(process.env.TOKEN_REFRESH_BUFFER_MS || "300000", 10),
    dataDir: process.env.DATA_DIR || "data",
  },

  modelAliases: {
    "qwen-plus": { provider: "qwen", model: "qwen-plus" },
    "qwen-max": { provider: "qwen", model: "qwen-max" },
    "qwen-turbo": { provider: "qwen", model: "qwen-turbo" },
    "glm-4-plus": { provider: "glm", model: "glm-4-plus" },
    "glm-4-flash": { provider: "glm", model: "glm-4-flash" },
    "claude-3-5-sonnet": { provider: "claude", model: "claude-3-5-sonnet-20241022" },
    "claude-3-5-haiku": { provider: "claude", model: "claude-3-5-haiku-20241022" },
    "gpt-4o": { provider: "openai", model: "gpt-4o" },
    "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },
    "gpt-5.5": { provider: "openai", model: "gpt-5.5" },
    "glm-5.2": { provider: "glm", model: "glm-5.2" },
    "claude-opus-4.8": { provider: "claude", model: "claude-opus-4-8-20250625" },
    "kimi": { provider: "kimi", model: "kimi" },
  },
};

module.exports = config;