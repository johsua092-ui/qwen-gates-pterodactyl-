/**
 * Qwen scraper adapter — scrapes chat.qwen.ai without API keys.
 * Based on existing qwen.js by reiz | yippie
 * Uses cookie-based auth + SSE streaming.
 */
const { randomUUID } = require("node:crypto");
const {
  parseSSE,
  streamToResponse,
  collectFullResponse,
  makeJsonResponse,
} = require("./base");

const BASE_URL = "https://chat.qwen.ai";

class QwenScraper {
  constructor(cookie, bxUmidToken = "") {
    this.cookie = cookie;
    this.bxUmidToken = bxUmidToken;
    this.chatId = null;
  }

  get headers() {
    return {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/event-stream",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
      Cookie: this.cookie,
      "Bx-Umidtoken": this.bxUmidToken,
    };
  }

  async createChat() {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        title: "gateway",
        session_id: randomUUID(),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Qwen createChat failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    this.chatId = data.id || data.chat_id;
    return this.chatId;
  }

  buildPayload(chatId, messages, model = "qwen3-max") {
    const prompt = messages[messages.length - 1]?.content || "";
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    return {
      chat_id: chatId,
      id: randomUUID(),
      model: model,
      messages: [...history, { role: "user", content: prompt }],
      params: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 4096,
        enable_search: false,
      },
      extra: { meta: { subChatType: "t2t" } },
      sub_chat_type: "t2t",
    };
  }

  async send(chatId, messages, model) {
    const payload = this.buildPayload(chatId, messages, model);
    const res = await fetch(`${BASE_URL}/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Qwen send failed (${res.status}): ${text}`);
    }
    return res;
  }

  async chat(messages, model, stream, res) {
    if (!this.cookie) {
      throw new Error("QWEN_COOKIE not set — cannot scrape Qwen");
    }

    if (!this.chatId) {
      await this.createChat();
    }

    const response = await this.send(this.chatId, messages, model);

    const extractDelta = (chunk) => {
      if (chunk.content) return chunk.content;
      if (chunk.delta?.content) return chunk.delta.content;
      if (chunk.choices?.[0]?.delta?.content) return chunk.choices[0].delta.content;
      return null;
    };

    if (stream) {
      await streamToResponse(response, res, model, extractDelta);
      return;
    }

    const fullText = await collectFullResponse(response, extractDelta);
    return makeJsonResponse(fullText, model);
  }
}

module.exports = { QwenScraper };
