import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function findCursorCli() {
  // Prefer the app-bundle CLI: ~/.local/bin/cursor is a shim that depends on
  // PATH, which is unreliable from the extension host (minimal GUI PATH).
  const candidates = [
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    "/usr/local/bin/cursor",
    path.join(os.homedir(), ".local", "bin", "cursor"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const fromPath = spawnSync("which", ["cursor"], { encoding: "utf8" });
  if (fromPath.status === 0 && fromPath.stdout.trim()) {
    return fromPath.stdout.trim();
  }
  return null;
}

export function mainCursorUserDir() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
    );
  }
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Cursor", "User");
  }
  return path.join(os.homedir(), ".config", "Cursor", "User");
}

export function mainCursorProfileRoot() {
  return path.dirname(mainCursorUserDir());
}

/**
 * Parse ps output for cursor processes and their --user-data-dir
 * @returns {Map<string, number>} profileRoot -> count of processes
 */
export function listRunningCursorProfiles() {
  const map = new Map();
  let output = "";
  try {
    if (process.platform === "win32") {
      output = execSync(
        "wmic process where \"name='Cursor.exe'\" get CommandLine",
        {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
    } else {
      // ps -eo: ps axo intermittently misses GUI processes in some contexts
      output = execSync("ps -eo command=", {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
    }
  } catch {
    return map;
  }

  const lines = output.split("\n");
  for (const line of lines) {
    if (!/cursor/i.test(line)) continue;
    // Skip helper processes (renderer/gpu/network); only the main process
    // (no --type= flag) represents a running profile window.
    if (line.includes("--type=")) continue;
    const dir = parseUserDataDirFromCommandLine(line);
    if (dir) {
      const normalized = path.resolve(dir);
      map.set(normalized, (map.get(normalized) || 0) + 1);
    }
  }
  return map;
}

/**
 * @param {string} line
 */
export function parseUserDataDirFromCommandLine(line) {
  const flag = "--user-data-dir";
  const idx = line.indexOf(flag);
  if (idx === -1) return null;
  let rest = line.slice(idx + flag.length).trim();
  if (rest.startsWith("=")) rest = rest.slice(1).trim();
  if (!rest.length) return null;
  if (rest[0] === '"' || rest[0] === "'") {
    const q = rest[0];
    const end = rest.indexOf(q, 1);
    if (end === -1) return null;
    return rest.slice(1, end);
  }
  const space = rest.search(/\s/);
  return space === -1 ? rest : rest.slice(0, space);
}

export function isCursorRunning() {
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      execSync("pgrep -x Cursor", { stdio: "ignore" });
      return true;
    }
  } catch {
    return false;
  }
  return listRunningCursorProfiles().size > 0;
}

export function hasSqlite3() {
  try {
    execSync("which sqlite3", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if secret key row exists (never reads value)
 * @param {string} stateDbPath
 * @param {string} key
 */
export function stateDbHasKey(stateDbPath, key) {
  if (!fs.existsSync(stateDbPath) || !hasSqlite3()) return false;
  try {
    const out = execSync(
      `sqlite3 ${shellQuote(stateDbPath)} "SELECT 1 FROM ItemTable WHERE key = ${shellQuote(key)} LIMIT 1;"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    return out.trim() === "1";
  } catch {
    return false;
  }
}

/**
 * List ItemTable keys matching pattern (names only)
 * @param {string} stateDbPath
 * @param {string} likePattern SQL LIKE pattern
 */
export function stateDbKeysLike(stateDbPath, likePattern) {
  if (!fs.existsSync(stateDbPath) || !hasSqlite3()) return [];
  try {
    const out = execSync(
      `sqlite3 ${shellQuote(stateDbPath)} "SELECT key FROM ItemTable WHERE key LIKE ${shellQuote(likePattern)};"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if Bonzai base URL appears in any ItemTable value (substring, no key dump)
 * @param {string} stateDbPath
 * @param {string} urlFragment
 */
export function stateDbValueContains(stateDbPath, urlFragment) {
  if (!fs.existsSync(stateDbPath) || !hasSqlite3()) return false;
  try {
    const out = execSync(
      `sqlite3 ${shellQuote(stateDbPath)} "SELECT 1 FROM ItemTable WHERE CAST(value AS TEXT) LIKE ${shellQuote("%" + urlFragment + "%")} LIMIT 1;"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    return out.trim() === "1";
  } catch {
    return false;
  }
}

/**
 * True if the value for `key` is byte-identical in both state DBs.
 * Comparison happens inside SQL; the value never enters this process.
 * @param {string} dbA
 * @param {string} dbB
 * @param {string} key
 */
export function stateDbValuesMatch(dbA, dbB, key) {
  if (!fs.existsSync(dbA) || !fs.existsSync(dbB) || !hasSqlite3()) {
    return false;
  }
  try {
    const out = execSync(
      `sqlite3 ${shellQuote(dbA)} "ATTACH DATABASE ${shellQuote(dbB)} AS other; SELECT CASE WHEN (SELECT value FROM ItemTable WHERE key = ${shellQuote(key)}) IS NOT NULL AND (SELECT value FROM ItemTable WHERE key = ${shellQuote(key)}) = (SELECT value FROM other.ItemTable WHERE key = ${shellQuote(key)}) THEN 1 ELSE 0 END;"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    return out.trim() === "1";
  } catch {
    return false;
  }
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export const SECRET_OPENAI_KEY = "secret://cursorAuth/openAIKey";
export const SUBAGENT_OVERRIDES_KEY = "cursor/subagentModelOverrides";
export const BONZAI_BASE_URL_FRAGMENT = "connect.iobonzai.com/cursor";
