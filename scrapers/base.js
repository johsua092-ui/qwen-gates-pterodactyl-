/**
 * Base scraper utilities shared across all provider scrapers.
 * CommonJS — no native deps required.
 */
const crypto = require("node:crypto");

function uuid() {
  return crypto.randomUUID();
}

/**
 * Parse a Server-Sent Events stream from a fetch Response.
 * Yields parsed JSON objects or raw text lines.
 */
async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data);
        } catch {
          yield { raw: data };
        }
      }
    }
  }
}

/**
 * Build a non-streaming response by collecting all SSE chunks.
 */
async function collectFullResponse(response, extractDelta) {
  let full = "";
  for await (const chunk of parseSSE(response)) {
    const delta = extractDelta(chunk);
    if (delta) full += delta;
  }
  return full;
}

/**
 * Forward SSE chunks to an Express response as OpenAI-compatible SSE.
 */
async function streamToResponse(response, res, model, extractDelta) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const id = `chatcmpl-${uuid().slice(0, 8)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const chunk of parseSSE(response)) {
    const delta = extractDelta(chunk);
    const sseData = {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: delta ? { content: delta } : {},
          finish_reason: null,
        },
      ],
    };
    res.write(`data: ${JSON.stringify(sseData)}\n\n`);
  }

  // final chunk
  const finalData = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };
  res.write(`data: ${JSON.stringify(finalData)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * Return a non-streaming OpenAI-compatible JSON response.
 */
function makeJsonResponse(fullText, model) {
  return {
    id: `chatcmpl-${uuid().slice(0, 8)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: fullText },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

module.exports = {
  uuid,
  parseSSE,
  collectFullResponse,
  streamToResponse,
  makeJsonResponse,
};
