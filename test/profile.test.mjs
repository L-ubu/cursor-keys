import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildFirstRunChecklist,
  cloneStateDb,
  pruneStateDbHistory,
} from "../src/profile.mjs";
import { profileStateDb } from "../src/config.mjs";
import { hasSqlite3, stateDbKeysLike } from "../src/detect.mjs";

const NAME = "jlr_mss";
const BASE = "https://gateway.example.com/v1";

describe("buildFirstRunChecklist", () => {
  it("darwin orders clone before set-key before doctor", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "darwin");
    const clone = text.indexOf(`cursor-keys clone ${NAME}`);
    const setKey = text.indexOf(`cursor-keys set-key ${NAME}`);
    const doctor = text.indexOf(`cursor-keys doctor ${NAME}`);
    assert.ok(clone >= 0 && setKey >= 0 && doctor >= 0);
    assert.ok(clone < setKey && setKey < doctor);
  });

  it("darwin includes copy-paste command lines", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "darwin");
    assert.match(text, /cursor-keys clone jlr_mss/);
    assert.match(text, /cursor-keys set-key jlr_mss/);
    assert.match(text, /cursor-keys doctor jlr_mss/);
  });

  it("darwin interpolates baseUrl in manual alternative", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "darwin");
    assert.match(text, new RegExp(BASE.replace(/\./g, "\\.")));
  });

  it("win32 includes open and manual paste path, not set-key", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "win32");
    assert.match(text, /cursor-keys open jlr_mss/);
    assert.match(text, /Cursor Settings → Models → API keys/);
    assert.match(text, new RegExp(BASE.replace(/\./g, "\\.")));
    assert.doesNotMatch(text, /cursor-keys set-key/);
  });

  it("linux matches win32 manual path (no set-key until injection ships)", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "linux");
    assert.match(text, /cursor-keys open jlr_mss/);
    assert.doesNotMatch(text, /cursor-keys set-key/);
  });

  it("empty baseUrl adds the config step and uses a placeholder gateway", () => {
    const text = buildFirstRunChecklist(NAME, "", "darwin");
    assert.match(text, /cursor-keys config baseUrl <your-gateway-url>/);
    assert.match(text, /https:\/\/gateway\.example\.com\/v1/);
  });

  it("configured baseUrl skips the config step", () => {
    const text = buildFirstRunChecklist(NAME, BASE, "darwin");
    assert.doesNotMatch(text, /cursor-keys config baseUrl/);
  });
});

describe("cloneStateDb", () => {
  it("scrubs donor secrets but keeps sign-in and plain settings rows", (t) => {
    if (!hasSqlite3()) {
      t.skip("sqlite3 not available");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-keys-clone-"));
    try {
      const donor = path.join(tmp, "donor");
      const target = path.join(tmp, "target");
      const donorDbDir = path.join(donor, "User", "globalStorage");
      fs.mkdirSync(donorDbDir, { recursive: true });
      const donorDb = path.join(donorDbDir, "state.vscdb");
      execFileSync("sqlite3", [
        donorDb,
        "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
      ]);
      const rows = {
        "secret://cursorAuth/openAIKey": "donor-key-blob",
        'secret://{"extensionId":"some.ext","key":"token"}': "ext-secret-blob",
        "mcpOAuth.global.abc123": "mcp-oauth-data",
        "cursorAuth/accessToken": "session-token",
        "cursorAuth/refreshToken": "session-token",
        "cursor/subagentModelOverrides": "{}",
      };
      for (const [k, v] of Object.entries(rows)) {
        execFileSync("sqlite3", [
          donorDb,
          `INSERT INTO ItemTable (key, value) VALUES ('${k}', '${v}');`,
        ]);
      }
      execFileSync("sqlite3", [
        donorDb,
        "CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
      ]);
      execFileSync("sqlite3", [
        donorDb,
        "INSERT INTO cursorDiskKV (key, value) VALUES ('agentKv:blob:abc123', 'chat-history-blob');",
      ]);
      execFileSync("sqlite3", [
        donorDb,
        "CREATE TABLE composerHeaders (key TEXT, value TEXT);",
      ]);
      execFileSync("sqlite3", [
        donorDb,
        "INSERT INTO composerHeaders (key, value) VALUES ('composer-1', 'header');",
      ]);

      const scrubbed = cloneStateDb(donor, target);
      assert.equal(scrubbed, 3);

      const keys = stateDbKeysLike(profileStateDb(target), "%").sort();
      assert.deepEqual(keys, [
        "cursor/subagentModelOverrides",
        "cursorAuth/accessToken",
        "cursorAuth/refreshToken",
      ]);
      const historyRows = execFileSync("sqlite3", [
        profileStateDb(target),
        "SELECT (SELECT count(*) FROM cursorDiskKV) + (SELECT count(*) FROM composerHeaders);",
      ], { encoding: "utf8" }).trim();
      assert.equal(historyRows, "0");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("pruneStateDbHistory", () => {
  it("deletes history tables, keeps ItemTable, shrinks the file", (t) => {
    if (!hasSqlite3()) {
      t.skip("sqlite3 not available");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-keys-prune-"));
    try {
      const db = path.join(tmp, "state.vscdb");
      execFileSync("sqlite3", [
        db,
        "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
      ]);
      execFileSync("sqlite3", [
        db,
        "INSERT INTO ItemTable (key, value) VALUES ('cursorAuth/accessToken', 'session-token');",
      ]);
      execFileSync("sqlite3", [
        db,
        "CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
      ]);
      execFileSync("sqlite3", [
        db,
        `INSERT INTO cursorDiskKV (key, value) VALUES ('agentKv:blob:abc', zeroblob(1048576));`,
      ]);

      const { beforeBytes, afterBytes } = pruneStateDbHistory(db);
      assert.ok(afterBytes < beforeBytes);
      assert.deepEqual(stateDbKeysLike(db, "%"), ["cursorAuth/accessToken"]);
      const left = execFileSync("sqlite3", [
        db,
        "SELECT count(*) FROM cursorDiskKV;",
      ], { encoding: "utf8" }).trim();
      assert.equal(left, "0");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is a no-op on DBs without history tables", (t) => {
    if (!hasSqlite3()) {
      t.skip("sqlite3 not available");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-keys-prune-"));
    try {
      const db = path.join(tmp, "state.vscdb");
      execFileSync("sqlite3", [
        db,
        "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);",
      ]);
      execFileSync("sqlite3", [
        db,
        "INSERT INTO ItemTable (key, value) VALUES ('cursorAuth/accessToken', 'session-token');",
      ]);
      const { beforeBytes, afterBytes } = pruneStateDbHistory(db);
      assert.ok(afterBytes <= beforeBytes);
      assert.deepEqual(stateDbKeysLike(db, "%"), ["cursorAuth/accessToken"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
