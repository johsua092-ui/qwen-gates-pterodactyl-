#!/usr/bin/env node
// CLI buat ngobrol sama gateway multi-model.
// Contoh:
//   gateway-chat "Halo, kenalin diri kamu"          # sekali jalan
//   gateway-chat -m opus-4.8 "Tulis pantun"          # pilih model
//   gateway-chat                                      # mode interaktif (REPL)
//   gateway-chat --list                              # lihat daftar model
//
// Konfigurasi lewat env atau flag:
//   GATEWAY_URL (default http://localhost:3000)  -u/--url
//   GATEWAY_KEY (default kosong)                 -k/--key
//   GATEWAY_MODEL (default qwen-plus-3.7)        -m/--model

import readline from "node:readline"

const DEFAULT_MODEL = "qwen-plus-3.7"

function parseArgs(argv) {
  const opts = {
    url: process.env.GATEWAY_URL || "http://localhost:3000",
    key: process.env.GATEWAY_KEY || "",
    model: process.env.GATEWAY_MODEL || DEFAULT_MODEL,
    system: process.env.GATEWAY_SYSTEM || "",
    stream: true,
    list: false,
    help: false,
    prompt: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case "-u": case "--url": opts.url = argv[++i]; break
      case "-k": case "--key": opts.key = argv[++i]; break
      case "-m": case "--model": opts.model = argv[++i]; break
      case "-s": case "--system": opts.system = argv[++i]; break
      case "--no-stream": opts.stream = false; break
      case "--list": case "--models": opts.list = true; break
      case "-h": case "--help": opts.help = true; break
      default: opts.prompt.push(a)
    }
  }
  return opts
}

// Rapihin base URL: buang slash akhir dan akhiran /v1 kalau ada.
function normalizeBase(url) {
  return String(url).replace(/\/+$/, "").replace(/\/v1$/, "")
}

function authHeaders(key) {
  const h = { "Content-Type": "application/json" }
  if (key) h["Authorization"] = `Bearer ${key}`
  return h
}

function fail(msg) {
  console.error(`\x1b[31m${msg}\x1b[0m`)
  process.exit(1)
}

async function listModels(opts) {
  const base = normalizeBase(opts.url)
  let res
  try {
    res = await fetch(`${base}/v1/models`, { headers: authHeaders(opts.key) })
  } catch (e) {
    fail(`Gagal konek ke gateway di ${base}: ${e.message}`)
  }
  if (!res.ok) fail(`Gateway balas ${res.status}: ${await res.text()}`)
  const data = await res.json()
  console.log("Model yang tersedia:")
  for (const m of data.data || []) {
    console.log(`  - ${m.id}${m.owned_by ? `  (${m.owned_by})` : ""}`)
  }
}

// Kirim pesan; kalau stream true, tulis token begitu datang. Balikin teks lengkap.
async function chat(opts, messages) {
  const base = normalizeBase(opts.url)
  const payload = { model: opts.model, messages, stream: opts.stream }

  let res
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: authHeaders(opts.key),
      body: JSON.stringify(payload),
    })
  } catch (e) {
    fail(`Gagal konek ke gateway di ${base}: ${e.message}`)
  }

  if (!res.ok) {
    let detail = await res.text()
    try { detail = JSON.stringify(JSON.parse(detail)) } catch {}
    fail(`Gateway balas ${res.status}: ${detail}`)
  }

  if (!opts.stream) {
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ""
    process.stdout.write(text + "\n")
    return text
  }

  // Streaming SSE ala OpenAI: baris "data: {json}" sampai "data: [DONE]".
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let full = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const evt of events) {
      const line = evt.split("\n").find((l) => l.startsWith("data:"))
      if (!line) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === "[DONE]") continue
      let parsed
      try { parsed = JSON.parse(jsonStr) } catch { continue }
      if (parsed.error) fail(`Error dari gateway: ${JSON.stringify(parsed.error)}`)
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) {
        process.stdout.write(delta)
        full += delta
      }
    }
  }
  process.stdout.write("\n")
  return full
}

function printHelp() {
  console.log(`gateway-chat - CLI buat gateway multi-model

Pemakaian:
  gateway-chat [opsi] ["prompt"]

Opsi:
  -m, --model <nama>   Model (default: ${DEFAULT_MODEL})
  -u, --url <url>      Base URL gateway (default: http://localhost:3000)
  -k, --key <kunci>    GATEWAY_KEY kalau auth nyala
  -s, --system <teks>  System prompt
      --no-stream      Matiin streaming (tunggu jawaban penuh)
      --list           Tampilkan daftar model lalu keluar
  -h, --help           Bantuan ini

Env: GATEWAY_URL, GATEWAY_KEY, GATEWAY_MODEL, GATEWAY_SYSTEM

Contoh model: opus-4.8, sonnet-5, fable-5, qwen-max-3.7, qwen-plus-3.7, glm-5.2

Mode interaktif (jalanin tanpa prompt) punya perintah:
  /model <nama>   ganti model      /system <teks>  set system prompt
  /models         daftar model     /reset          hapus riwayat
  /exit           keluar`)
}

async function interactive(opts) {
  console.log(`Mode chat interaktif. Model: \x1b[36m${opts.model}\x1b[0m  |  gateway: ${normalizeBase(opts.url)}`)
  console.log(`Ketik pesan lalu Enter. /help buat perintah, /exit buat keluar.\n`)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const messages = []
  if (opts.system) messages.push({ role: "system", content: opts.system })

  const ask = () => rl.question("\x1b[32myou›\x1b[0m ", async (input) => {
    const line = input.trim()
    if (!line) return ask()

    if (line.startsWith("/")) {
      const [cmd, ...rest] = line.slice(1).split(" ")
      const arg = rest.join(" ").trim()
      switch (cmd) {
        case "exit": case "quit": rl.close(); return
        case "help": printHelp(); return ask()
        case "models": await listModels(opts); return ask()
        case "model":
          if (arg) { opts.model = arg; console.log(`→ model: ${opts.model}`) }
          else console.log(`model sekarang: ${opts.model}`)
          return ask()
        case "system":
          opts.system = arg
          // ganti/insert system message di awal riwayat
          if (messages[0]?.role === "system") messages[0].content = arg
          else messages.unshift({ role: "system", content: arg })
          console.log(`→ system prompt di-set`)
          return ask()
        case "reset":
          messages.length = 0
          if (opts.system) messages.push({ role: "system", content: opts.system })
          console.log("→ riwayat dihapus")
          return ask()
        default:
          console.log(`perintah gak dikenal: /${cmd} (coba /help)`)
          return ask()
      }
    }

    messages.push({ role: "user", content: line })
    process.stdout.write(`\x1b[36m${opts.model}›\x1b[0m `)
    const reply = await chat(opts, messages)
    messages.push({ role: "assistant", content: reply })
    ask()
  })

  rl.on("close", () => { console.log("\nDaah! 👋"); process.exit(0) })
  ask()
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return printHelp()
  if (opts.list) return listModels(opts)

  if (opts.prompt.length) {
    const messages = []
    if (opts.system) messages.push({ role: "system", content: opts.system })
    messages.push({ role: "user", content: opts.prompt.join(" ") })
    await chat(opts, messages)
    return
  }

  await interactive(opts)
}

main()
