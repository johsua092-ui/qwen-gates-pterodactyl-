import fs from "fs";
import path from "path";
import crypto from "crypto";

const KEYS_FILE = path.join(process.cwd(), "data", "keys.json");

export function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
  } catch (e) {
    return [];
  }
}

export function saveKeys(keys) {
  if (!fs.existsSync(path.dirname(KEYS_FILE))) {
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export function generateKey(name) {
  const keys = loadKeys();
  const newKey = "sk-gw-" + crypto.randomBytes(16).toString("hex");
  keys.push({
    key: newKey,
    name: name || "Unknown",
    createdAt: new Date().toISOString(),
  });
  saveKeys(keys);
  return newKey;
}

export function revokeKey(key) {
  let keys = loadKeys();
  const initialLength = keys.length;
  keys = keys.filter(k => k.key !== key);
  saveKeys(keys);
  return keys.length < initialLength;
}

export function isValidKey(key) {
  // If GATEWAY_KEY is set in env, it's the master key
  if (process.env.GATEWAY_KEY && key === process.env.GATEWAY_KEY) {
    return true;
  }
  const keys = loadKeys();
  return keys.some(k => k.key === key);
}
