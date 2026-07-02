# qwen-gates-pterodactyl-

Gateway **OpenAI-compatible** yang nge-proxy request ke beberapa provider (Qwen, GLM, Claude) lewat satu endpoint `/v1/chat/completions`. Bisa dijalanin di **Pterodactyl** dan ada **CLI** buat ngobrol langsung dari terminal.

## Model yang didukung

Panggil model pakai nama **alias** di bawah. Alias ini dipetakan ke id model asli tiap provider, dan bisa dioverride lewat environment variable (kolom paling kanan) tanpa ubah kode.

| Alias | Provider | Default id upstream | Env override |
| --- | --- | --- | --- |
| `opus-4.8` | Claude | `claude-opus-4-1` | `MODEL_OPUS_48` |
| `sonnet-5` | Claude | `claude-sonnet-4-5` | `MODEL_SONNET_5` |
| `fable-5` | Claude | `claude-haiku-4-5` | `MODEL_FABLE_5` |
| `qwen-max-3.7` | Qwen | `qwen-max` | `MODEL_QWEN_MAX_37` |
| `qwen-plus-3.7` | Qwen | `qwen-plus` | `MODEL_QWEN_PLUS_37` |
| `glm-5.2` | GLM | `glm-4-plus` | `MODEL_GLM_52` |

<aside>
💡

Nilai default di atas adalah id model yang valid saat ini. Kalau providermu punya id yang beda (misal nama versi baru), tinggal set env override-nya — misalnya `MODEL_OPUS_48=claude-opus-4-2-20260101`. Alias-nya tetap sama, jadi kode client kamu gak perlu diubah.

</aside>

Model "mentah" lama (`qwen-plus`, `glm-4-plus`, `claude-3-5-sonnet-20241022`, dll.) dan format `provider/model` (contoh `claude/claude-3-5-haiku-20241022`) tetap bisa dipakai.

## Jalanin lokal

```bash
npm install
cp .env.example .env   # isi API key kamu
npm start              # server jalan di port 3000 (atau PORT)
```

## Deploy di Pterodactyl

**Cara cepat (pakai egg):**

1. Di panel admin: **Nests → Import Egg**, upload `pterodactyl-egg.json`.
2. Bikin server baru pakai egg **Multi-Model Gateway** itu.
3. Isi variable: `GATEWAY_KEY`, `QWEN_API_KEY`, `GLM_API_KEY`, `CLAUDE_API_KEY` (dan `GIT_ADDRESS` kalau mau auto-clone dari repo).
4. **Start** — cek log muncul `Gateway jalan di port ...`.

**Cara manual:**

1. Bikin server pakai egg **Node.js** (kalau ada egg Bun juga boleh — startup `bun install && bun server.js`).
2. Masukin file lewat Git (`git clone <repo> .` di Console) atau upload manual `package.json`, `server.js`, `cli.js`.
3. **Startup command**: `npm install && node server.js`.
4. Isi environment variable di tab *Startup* / *Variables* (lebih aman daripada file `.env`).
5. **Port** — kode otomatis baca `SERVER_PORT` dan bind ke `0.0.0.0`, jadi biarin `PORT` kosong.

<aside>
🔒

Jangan commit API key ke GitHub. Simpan semua key di Environment Variables panel Pterodactyl, bukan di file `.env` yang ke-push.

</aside>

## CLI (`gateway-chat`)

Ngobrol sama gateway langsung dari terminal. Gak butuh dependency tambahan (cuma Node 18+).

```bash
# sekali jalan
node cli.js "Halo, kenalin diri kamu"

# pilih model
node cli.js -m opus-4.8 "Tulis pantun tentang kopi"

# arahin ke server Pterodactyl + auth
node cli.js -u http://HOST:PORT -k GATEWAY_KEY_KAMU -m glm-5.2 "Halo"

# lihat daftar model
node cli.js --list

# mode interaktif (REPL) — jalanin tanpa prompt
node cli.js -m sonnet-5
```

Bisa juga dipasang sebagai command global:

```bash
npm install        # atau: npm link
gateway-chat -m qwen-max-3.7 "Halo"
```

Konfigurasi default lewat env biar gak ngetik flag terus: `GATEWAY_URL`, `GATEWAY_KEY`, `GATEWAY_MODEL`, `GATEWAY_SYSTEM`.

Di **mode interaktif** ada perintah: `/model <nama>`, `/models`, `/system <teks>`, `/reset`, `/exit`.

## Test pakai curl

Ganti `HOST:PORT` sama alamat server kamu.

```bash
# cek hidup
curl http://HOST:PORT/

# chat (alias baru)
curl http://HOST:PORT/v1/chat/completions \
  -H "Authorization: Bearer GATEWAY_KEY_KAMU" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus-3.7","messages":[{"role":"user","content":"Halo!"}]}'

curl http://HOST:PORT/v1/chat/completions \
  -H "Authorization: Bearer GATEWAY_KEY_KAMU" \
  -H "Content-Type: application/json" \
  -d '{"model":"opus-4.8","messages":[{"role":"user","content":"Halo!"}],"max_tokens":200}'
```

Pakai dari kode Python (library `openai`):

```python
from openai import OpenAI

client = OpenAI(base_url="http://HOST:PORT/v1", api_key="GATEWAY_KEY_KAMU")

for model in ["qwen-plus-3.7", "glm-5.2", "sonnet-5"]:
    r = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Kenalin diri kamu singkat"}],
    )
    print(model, "->", r.choices[0].message.content)
```

## Catatan

- Alias di atas cuma "nama ramah". Yang bener-bener dikirim ke provider adalah id upstream-nya, jadi pastikan akunmu memang punya akses ke model itu.
- Endpoint Qwen default versi internasional. Kalau akun region China, ganti `QWEN_BASE_URL` ke `https://dashscope.aliyuncs.com/compatible-mode/v1`.
- Streaming (`"stream": true`) didukung buat semua provider, termasuk Claude yang diterjemahin ke format OpenAI.
