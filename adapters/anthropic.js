function toAnthropicBody(body) {
  const systemParts = [];
  const messages = [];
  for (const msg of body.messages || []) {
    if (msg.role === "system") {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    } else {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }
  }
  const out = {
    model: body.model,
    max_tokens: body.max_tokens || 1024,
    messages,
    stream: !!body.stream,
  };
  if (systemParts.length) out.system = systemParts.join("\n\n");
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.stop) out.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  return out;
}

function mapStop(reason) {
  if (reason === "max_tokens") return "length";
  return "stop";
}

export async function handleAnthropic(provider, body, res) {
  const anthropicBody = toAnthropicBody(body);
  const upstream = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicBody),
  });

  const created = Math.floor(Date.now() / 1000);
  const id = "chatcmpl-" + created;

  if (!body.stream) {
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data });
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    return res.json({
      id: data.id || id,
      object: "chat.completion",
      created,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: mapStop(data.stop_reason) }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (!upstream.ok) {
    const text = await upstream.text();
    res.write(`data: ${JSON.stringify({ error: { message: text } })}\n\n`);
    return res.end();
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr) continue;
      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch { continue; }
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        res.write(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model: body.model,
          choices: [{ index: 0, delta: { content: parsed.delta.text }, finish_reason: null }],
        })}\n\n`);
      } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
        res.write(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: mapStop(parsed.delta.stop_reason) }],
        })}\n\n`);
      }
    }
  }
  res.write("data: [DONE]\n\n");
  res.end();
}
