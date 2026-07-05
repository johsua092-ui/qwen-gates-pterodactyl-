/**
 * Kimi/Moonshot scraper adapter — scrapes kimi.moonshot.cn without API keys.
 * Based on existing kimi.js by reiz | yippie
 * Uses Bearer token auth + SSE streaming.
 */
const { randomUUID } = require("node:crypto");
const {
  parseSSE,
  streamToResponse,
  collectFullResponse,
  makeJsonResponse,
} = require("./base");

const BASE = "https://kimi.moonshot.cn";

class KimiScraper {
  constructor(token) {
    this.token = token;
    this.chatId = null;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Referer: "https://kimi.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
  }

  async createChat(name = "gateway") {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kimi createChat failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    this.chatId = data.id || data.chat_id;
    return this.chatId;
  }

  async send(chatId, messages, model) {
    const lastMsg = messages[messages.length - 1];
    const payload = {
      chat_id: chatId,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      model: model || "kimi",
      stream: true,
    };

    const res = await fetch(`${BASE}/api/chat/${chatId}/completion/stream`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kimi send failed (${res.status}): ${text}`);
    }
    return res;
  }

  async chat(messages, model, stream, res) {
    if (!this.token) {
      throw new Error("KIMI_TOKEN not set — cannot scrape Kimi");
    }

    if (!this.chatId) {
      await this.createChat();
    }

    const response = await this.send(this.chatId, messages, model);

    const extractDelta = (chunk) => {
      if (chunk.event === "cmpl" && chunk.text) return chunk.text;
      if (chunk.choices?.[0]?.delta?.content) return chunk.choices[0].delta.content;
      if (chunk.delta?.content) return chunk.delta.content;
      return null;
    };

    if (stream) {
      await streamToResponse(response, res, model || "kimi", extractDelta);
      return;
    }

    const fullText = await collectFullResponse(response, extractDelta);
    return makeJsonResponse(fullText, model || "kimi");
  }
}

module.exports = { KimiScraper };
