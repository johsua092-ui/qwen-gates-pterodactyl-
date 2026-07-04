#!/usr/bin/env node
import "dotenv/config";
import readline from "readline";
import { generateKey, loadKeys, revokeKey } from "./utils/auth.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "keys" && args[1] === "generate") {
  const name = args[2] || "CLI User";
  const key = generateKey(name);
  console.log(`\n✅ Generated new API key for "${name}":\n\n${key}\n`);
  console.log(`Use this key with the gateway or run 'node cli.js chat --key ${key}'\n`);
  process.exit(0);
}

if (command === "keys" && args[1] === "list") {
  const keys = loadKeys();
  console.log("\n🔑 Active API Keys:\n");
  keys.forEach(k => {
    console.log(`- ${k.key} (${k.name}) - Created: ${k.createdAt}`);
  });
  console.log("");
  process.exit(0);
}

if (command === "keys" && args[1] === "revoke") {
  const keyToRevoke = args[2];
  if (!keyToRevoke) {
    console.error("Please provide the key to revoke.");
    process.exit(1);
  }
  const success = revokeKey(keyToRevoke);
  if (success) console.log(`✅ Key ${keyToRevoke} revoked.`);
  else console.log(`❌ Key ${keyToRevoke} not found.`);
  process.exit(0);
}

if (command === "chat") {
  let apiKey = process.env.GATEWAY_KEY;
  const keyIndex = args.indexOf("--key");
  if (keyIndex !== -1 && args[keyIndex + 1]) {
    apiKey = args[keyIndex + 1];
  } else {
    // try to load the first available key if none provided
    const keys = loadKeys();
    if (keys.length > 0) apiKey = keys[0].key;
  }

  if (!apiKey) {
    console.error("No API key available. Run 'node cli.js keys generate' first.");
    process.exit(1);
  }

  console.log(`🤖 CLI Agent connected using key: ${apiKey.substring(0, 10)}...`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const model = "gpt-5.5"; // default for chat
  const messages = [{ role: "system", content: "You are a helpful CLI AI assistant." }];

  async function askQuestion() {
    rl.question("\nYou: ", async (input) => {
      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        rl.close();
        return;
      }

      messages.push({ role: "user", content: input });
      process.stdout.write("\n🤖 Agent: ");

      try {
        const res = await fetch("http://localhost:3000/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true
          })
        });

        if (!res.ok) {
          console.error(`\nError: ${res.status} ${res.statusText}`);
          const text = await res.text();
          console.error(text);
          askQuestion();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const text = data.choices[0]?.delta?.content || "";
                process.stdout.write(text);
                fullResponse += text;
              } catch (e) {}
            }
          }
        }
        messages.push({ role: "assistant", content: fullResponse });
        console.log("");
      } catch (err) {
        console.error("\nFailed to connect to gateway:", err.message);
      }
      askQuestion();
    });
  }
  askQuestion();
} else if (command !== "keys" && command !== "chat") {
  console.log(`
🚀 Multi-Model Gateway CLI

Usage:
  node cli.js keys generate [name]   - Generate a new API key
  node cli.js keys list              - List all API keys
  node cli.js keys revoke <key>      - Revoke an API key
  node cli.js chat [--key <key>]     - Start interactive chat agent
  `);
  process.exit(0);
}
