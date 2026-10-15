import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig, updateConfig } from "../src/config.mjs";

describe("config io", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-keys-config-"));
  const file = path.join(dir, "config.json");
  const oldEnv = process.env.CURSOR_KEYS_CONFIG_FILE;
  process.env.CURSOR_KEYS_CONFIG_FILE = file;

  after(() => {
    if (oldEnv === undefined) delete process.env.CURSOR_KEYS_CONFIG_FILE;
    else process.env.CURSOR_KEYS_CONFIG_FILE = oldEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const seed = () =>
    saveConfig({
      profilesRoot: "~/.cursor-profiles",
      baseUrl: "https://gateway.example.com/v1",
      projects: { a: { path: "~/a", color: "#845ef7" } },
    });

  it("saveConfig writes atomically and round-trips", () => {
    seed();
    assert.ok(fs.existsSync(file));
    const leftovers = fs
      .readdirSync(dir)
      .filter((f) => f.includes(".tmp"));
    assert.deepEqual(leftovers, []);
    const loaded = loadConfig();
    assert.equal(loaded.projects.a.color, "#845ef7");
    assert.equal(loaded.baseUrl, "https://gateway.example.com/v1");
  });

  it("updateConfig merges mutations onto a fresh load", () => {
    seed();
    updateConfig((c) => {
      c.projects.b = { path: "~/b", color: "#ff6b6b" };
    });
    const loaded = loadConfig();
    assert.deepEqual(Object.keys(loaded.projects).sort(), ["a", "b"]);
    assert.equal(loaded.baseUrl, "https://gateway.example.com/v1");
  });

  it("updateConfig removals keep unrelated projects", () => {
    seed();
    updateConfig((c) => {
      c.projects.b = { path: "~/b", color: "#ff6b6b" };
    });
    updateConfig((c) => {
      delete c.projects.a;
    });
    const loaded = loadConfig();
    assert.deepEqual(Object.keys(loaded.projects), ["b"]);
  });
});
