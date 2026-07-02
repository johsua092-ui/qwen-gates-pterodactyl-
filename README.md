# qwen-gates-pterodactyl-

## Deploy di Pterodactyl

1. **Bikin server baru** pakai egg **Node.js** (kalau ada egg Bun, boleh juga — startup tinggal `bun install && bun server.js`).
2. **Masukin file** lewat salah satu cara:
    - Git: set repo di panel, atau di tab Console jalankan `git clone <repo-kamu> .`
    - Atau upload manual `package.json`, `server.js` lewat File Manager.
3. **Startup command** — set jadi:
    - `npm install && node server.js` (Node), atau
    - `bun install && bun server.js` (Bun)
4. **Environment variables** — isi di tab *Startup* / *Variables* panel (lebih aman daripada file `.env`):
    - `GATEWAY_KEY`, `QWEN_API_KEY`, `GLM_API_KEY`, `CLAUDE_API_KEY` (dan `*_BASE_URL` kalau mau override).
5. **Port** — pakai port alokasi yang dikasih Pterodactyl. Kode udah otomatis baca `SERVER_PORT` dan bind ke `0.0.0.0`, jadi biarin `PORT` kosong.
6. **Start** server-nya, cek log muncul `Gateway jalan di port ...`.

<aside>
🔒

Jangan commit API key ke GitHub. Simpan semua key di Environment Variables panel Pterodactyl, bukan di file `.env` yang ke-push.

</aside>

## Cara test

Ganti `HOST:PORT` sama alamat server Pterodactyl kamu.

```bash
# cek hidup
curl http://HOST:PORT/

# Qwen
curl http://HOST:PORT/v1/chat/completions \
  -H "Authorization: Bearer GATEWAY_KEY_KAMU" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"Halo!"}]}'

# GLM
curl http://HOST:PORT/v1/chat/completions \
  -H "Authorization: Bearer GATEWAY_KEY_KAMU" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4-plus","messages":[{"role":"user","content":"Halo!"}]}'

# Claude
curl http://HOST:PORT/v1/chat/completions \
  -H "Authorization: Bearer GATEWAY_KEY_KAMU" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","messages":[{"role":"user","content":"Halo!"}],"max_tokens":200}'
```

Pakai dari kode Python (library `openai`):

```python
from openai import OpenAI

client = OpenAI(base_url="http://HOST:PORT/v1", api_key="GATEWAY_KEY_KAMU")

for model in ["qwen-plus", "glm-4-plus", "claude-3-5-sonnet-20241022"]:
    r = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Kenalin diri kamu singkat"}],
    )
    print(model, "->", r.choices[0].message.content)
```

## Catatan

- Nama model harus cocok sama yang didukung tiap provider (misal Qwen: `qwen-plus`/`qwen-max`; GLM: `glm-4-plus`/`glm-4-flash`; Claude: `claude-3-5-sonnet-20241022`).
- Kalau kamu mau, bisa juga panggil pakai format `provider/model`, contoh `claude/claude-3-5-haiku-20241022`, buat maksa provider tertentu.
- Endpoint Qwen default-nya versi internasional. Kalau akun kamu region China, ganti `QWEN_BASE_URL` ke `https://dashscope.aliyuncs.com/compatible-mode/v1`.