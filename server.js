import express from "express"

const app = express()
app.use(express.json({ limit: "20mb" }))

// ---- Config ----
// Pterodactyl kasih port lewat SERVER_PORT. Bind ke 0.0.0.0 biar bisa diakses.
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000
const GATEWAY_KEY = process.env.GATEWAY_KEY || "" // kunci yang harus dikirim client

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
}

// pilih provider dari nama model
function resolveProvider(model = "") {
  const m = String(model).toLowerCase()
  if (m.includes("/")) {
    const p = m.split("/")[0]
    if (PROVIDERS[p]) return p
  }
  if (m.startsWith("qwen")) return "qwen"
  if (m.startsWith("glm")) return "glm"
  if (m.startsWith("claude")) return "claude"
  return null
}

function stripPrefix(model) {
  return String(model).includes("/") ? String(model).split("/").slice(1).join("/") : model
}

// auth: client wajib kirim Authorization: Bearer <GATEWAY_KEY>
function checkAuth(req, res, next) {
  if (!GATEWAY_KEY) return next() // kalau kosong, auth dimatikan
  const auth = req.headers["authorization"] || ""
  const token = auth.replace(/^Bearer\s+/i, "")
  if (token !== GATEWAY_KEY) {
    return res.status(401).json({ error: { message: "Invalid gateway API key" } })
  }
  next()
}

app.get("/", (req, res) => res.json({ status: "ok", providers: Object.keys(PROVIDERS) }))
app.get("/health", (req, res) => res.json({ status: "ok" }))

app.get("/v1/models", checkAuth, (req, res) => {
  const ids = [
    "qwen-plus", "qwen-max", "qwen-turbo",
    "glm-4-plus", "glm-4", "glm-4-flash",
    "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
  ]
  res.json({
    object: "list",
    data: ids.map((id) => ({ id, object: "model", owned_by: resolveProvider(id) })),
  })
})

app.post("/v1/chat/completions", checkAuth, async (req, res) => {
  const body = req.body || {}
  const providerName = resolveProvider(body.model)
  if (!providerName) {
    return res.status(400).json({ error: { message: `Unknown model: ${body.model}` } })
  }
  const provider = PROVIDERS[providerName]
  if (!provider.apiKey) {
    return res.status(500).json({ error: { message: `${providerName} API key belum di-set` } })
  }
  const model = stripPrefix(body.model)

  try {
    if (provider.type === "openai") {
      return await handleOpenAI(provider, { ...body, model }, res)
    }
    return await handleAnthropic(provider, { ...body, model }, res)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.status(500).json({ error: { message: String(err) } })
    else res.end()
  }
})

// ---- Provider OpenAI-compatible (Qwen, GLM): proxy langsung ----
async function handleOpenAI(provider, body, res) {
  const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!body.stream) {
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  }

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  if (!upstream.ok) {
    const text = await upstream.text()
    res.write(`data: ${JSON.stringify({ error: { message: text } })}\n\n`)
    return res.end()
  }
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(decoder.decode(value, { stream: true }))
  }
  res.end()
}

// ---- Provider Anthropic (Claude): translate format ----
function toAnthropicBody(body) {
  const systemParts = []
  const messages = []
  for (const msg of body.messages || []) {
    if (msg.role === "system") {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content))
    } else {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })
    }
  }
  const out = {
    model: body.model,
    max_tokens: body.max_tokens || 1024,
    messages,
    stream: !!body.stream,
  }
  if (systemParts.length) out.system = systemParts.join("\n\n")
  if (body.temperature != null) out.temperature = body.temperature
  if (body.top_p != null) out.top_p = body.top_p
  if (body.stop) out.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop]
  return out
}

function mapStop(reason) {
  if (reason === "max_tokens") return "length"
  return "stop"
}

async function handleAnthropic(provider, body, res) {
  const anthropicBody = toAnthropicBody(body)
  const upstream = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicBody),
  })

  const created = Math.floor(Date.now() / 1000)
  const id = "chatcmpl-" + created

  if (!body.stream) {
    const data = await upstream.json()
    if (!upstream.ok) return res.status(upstream.status).json({ error: data })
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("")
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
    })
  }

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  if (!upstream.ok) {
    const text = await upstream.text()
    res.write(`data: ${JSON.stringify({ error: { message: text } })}\n\n`)
    return res.end()
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data:"))
      if (!dataLine) continue
      const jsonStr = dataLine.slice(5).trim()
      if (!jsonStr) continue
      let parsed
      try { parsed = JSON.parse(jsonStr) } catch { continue }
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        res.write(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model: body.model,
          choices: [{ index: 0, delta: { content: parsed.delta.text }, finish_reason: null }],
        })}\n\n`)
      } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
        res.write(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: mapStop(parsed.delta.stop_reason) }],
        })}\n\n`)
      }
    }
  }
  res.write("data: [DONE]\n\n")
  res.end()
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway jalan di port ${PORT}`)
})