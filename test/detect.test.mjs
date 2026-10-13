import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hasSqlite3,
  parseUserDataDirFromCommandLine,
  stateDbValuesMatch,
} from "../src/detect.mjs";

describe("detect", () => {
  it("parseUserDataDirFromCommandLine with space", () => {
    const line =
      "/Applications/Cursor.app/Contents/MacOS/Cursor --user-data-dir /Users/me/.cursor-profiles/jlr_mss --new-window /Users/me/Projects/jlr_mss";
    assert.equal(
      parseUserDataDirFromCommandLine(line),
      "/Users/me/.cursor-profiles/jlr_mss",
    );
  });

  it("parseUserDataDirFromCommandLine with equals", () => {
    const line = "cursor --user-data-dir=/tmp/profile-a foo";
    assert.equal(parseUserDataDirFromCommandLine(line), "/tmp/profile-a");
  });

  it("parseUserDataDirFromCommandLine with quotes", () => {
    const line = 'cursor --user-data-dir "/tmp/my profile" --new-window';
    assert.equal(parseUserDataDirFromCommandLine(line), "/tmp/my profile");
  });

  it("returns null when flag missing", () => {
    assert.equal(parseUserDataDirFromCommandLine("cursor /tmp/repo"), null);
  });

  it("stateDbValuesMatch detects identical and differing values", () => {
    if (!hasSqlite3()) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-keys-"));
    const a = path.join(dir, "a.db");
    const b = path.join(dir, "b.db");
    const setup = (db, value) =>
      execSync(
        `sqlite3 '${db}' "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB); INSERT INTO ItemTable VALUES ('k', '${value}');"`,
      );
    setup(a, "same-encrypted-blob");
    setup(b, "same-encrypted-blob");
    assert.equal(stateDbValuesMatch(a, b, "k"), true);
    execSync(`sqlite3 '${b}' "UPDATE ItemTable SET value = 'other' WHERE key = 'k';"`);
    assert.equal(stateDbValuesMatch(a, b, "k"), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
