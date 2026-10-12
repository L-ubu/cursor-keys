import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

const SERVICE_NAMES = ["Cursor Safe Storage", "cursor Safe Storage"];
export const OPENAI_KEY_ROW = "secret://cursorAuth/openAIKey";

function sh(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

let cachedPassword = null;

/**
 * Reads Cursor's own safeStorage password from the macOS Keychain.
 * May trigger a one-time Keychain permission dialog.
 */
export function getSafeStoragePassword() {
  if (cachedPassword) return cachedPassword;
  for (const svc of SERVICE_NAMES) {
    try {
      const out = execSync(`security find-generic-password -s ${sh(svc)} -w`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const pw = out.trim();
      if (pw) {
        cachedPassword = pw;
        return pw;
      }
    } catch {
      /* try next service name */
    }
  }
  throw new Error(
    "Could not read 'Cursor Safe Storage' from Keychain (permission denied?)",
  );
}

/** Chromium OSCrypt (macOS): PBKDF2-SHA1, salt 'saltysalt', 1003 iters, 16-byte key */
function deriveKey(password) {
  return crypto.pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

const IV = Buffer.alloc(16, 0x20); // 16 space bytes

export function oscryptEncrypt(plaintext, password) {
  const key = deriveKey(password);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, IV);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from("v10"), ct]);
}

/**
 * @param {number[]|string} data byte array (Cursor's format) or base64 string
 */
export function oscryptDecrypt(data, password) {
  const raw = Array.isArray(data)
    ? Buffer.from(data)
    : Buffer.from(data, "base64");
  if (raw.subarray(0, 3).toString() !== "v10") {
    throw new Error("Not a v10 OSCrypt blob");
  }
  const key = deriveKey(password);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, IV);
  return Buffer.concat([
    decipher.update(raw.subarray(3)),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Verify we can decrypt an existing Cursor secret. Returns only metadata,
 * never the plaintext.
 */
export function verifyDecryption(stateDbPath) {
  if (!fs.existsSync(stateDbPath)) return { ok: false, reason: "no state db" };
  const row = execFileSync(
    "sqlite3",
    [
      stateDbPath,
      `SELECT value FROM ItemTable WHERE key = '${OPENAI_KEY_ROW}' LIMIT 1;`,
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
  ).trim();
  if (!row) return { ok: false, reason: "no key row" };
  try {
    const parsed = JSON.parse(row);
    const password = getSafeStoragePassword();
    const plain = oscryptDecrypt(parsed.data, password);
    return {
      ok: true,
      length: plain.length,
      looksLikeApiKey: plain.startsWith("sk-"),
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Write an API key into a profile's encrypted store, using Cursor's own
 * encryption. The profile's Cursor window must be closed.
 */
export function setProfileApiKey(stateDbPath, apiKey) {
  if (!fs.existsSync(stateDbPath)) {
    throw new Error(`Profile state db missing: ${stateDbPath}`);
  }
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw new Error("API key should start with 'sk-'");
  }
  const password = getSafeStoragePassword();
  const buf = oscryptEncrypt(apiKey, password);
  // Cursor stores secrets as Buffer JSON: {"type":"Buffer","data":[bytes...]}
  const value = JSON.stringify({
    type: "Buffer",
    data: Array.from(buf),
  }).replace(/'/g, "''");
  // execFileSync: no shell, so JSON double quotes survive intact
  execFileSync(
    "sqlite3",
    [
      stateDbPath,
      `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('${OPENAI_KEY_ROW}', '${value}');`,
    ],
    { stdio: "ignore" },
  );
  // round-trip verification
  const check = verifyDecryption(stateDbPath);
  if (!check.ok) {
    throw new Error(
      `Wrote key but round-trip verification failed: ${check.reason}`,
    );
  }
  return check;
}
