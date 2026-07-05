/**
 * Claude scraper adapter — scrapes claude.ai without API keys.
 * Uses session cookie auth + SSE streaming.
 */
const { randomUUID } = require("node:crypto");
const {
  parseSSE,
  streamToResponse,
  collectFullResponse,
  makeJsonResponse,
} = require("./base");

const BASE = "https://claude.ai";

class ClaudeScraper {
  constructor(sessionKey) {
    this.sessionKey = sessionKey;
    this.organizationId = null;
    this.chatId = null;
  }

  get headers() {
    return {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/event-stream",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: BASE,
      Referer: `${BASE}/chat`,
      Cookie: `sessionKey=${this.sessionKey}`,
    };
  }

  async init() {
    const res = await fetch(`${BASE}/api/organizations`, {
      headers: { ...this.headers, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Claude auth failed (${res.status}): check sessionKey`);
    }
    const orgs = await res.json();
    this.organizationId = orgs[0]?.uuid || orgs[0]?.id;
    if (!this.organizationId) {
      throw new Error("Claude: no organization found");
    }
    return this.organizationId;
  }

  async createChat() {
    if (!this.organizationId) await this.init();

    const res = await fetch(
      `${BASE}/api/organizations/${this.organizationId}/chat_conversations`,
      {
        method: "POST",
        headers: { ...this.headers, Accept: "application/json" },
        body: JSON.stringify({
          uuid: randomUUID(),
          name: "gateway",
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude createChat failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    this.chatId = data.uuid || data.id;
    return this.chatId;
  }

  async send(chatId, messages, model) {
    if (!this.organizationId) await this.init();

    const prompt = messages[messages.length - 1]?.content || "";
    const payload = {
      completion: {
        prompt: typeof prompt === "string" ? prompt : JSON.stringify(prompt),
        timezone: "America/New_York",
        model: model || "claude-sonnet-4-20250514",
      },
      organization_uuid: this.organizationId,
      conversation_uuid: chatId,
      text: typeof prompt === "string" ? prompt : JSON.stringify(prompt),
    };

    const res = await fetch(`${BASE}/api/append_message`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude send failed (${res.status}): ${text}`);
    }
    return res;
  }

  async chat(messages, model, stream, res) {
    if (!this.sessionKey) {
      throw new Error("CLAUDE_SESSION_KEY not set — cannot scrape Claude");
    }

    if (!this.chatId) {
      await this.createChat();
    }

    const response = await this.send(this.chatId, messages, model);

    const extractDelta = (chunk) => {
      if (chunk.completion) return chunk.completion;
      if (chunk.delta?.text) return chunk.delta.text;
      if (chunk.event === "completion" && chunk.text) return chunk.text;
      return null;
    };

    if (stream) {
      await streamToResponse(response, res, model || "claude", extractDelta);
      return;
    }

    const fullText = await collectFullResponse(response, extractDelta);
    return makeJsonResponse(fullText, model || "claude");
  }
}

module.exports = { ClaudeScraper };
