import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_GETTABLE_KEYS,
  defaultConfig,
  expandHome,
  findProjectByPath,
  getConfigValue,
  isHexColor,
  pickColorForName,
  pickUnusedColor,
  validateConfig,
} from "../src/config.mjs";
import path from "node:path";

describe("config", () => {
  it("expandHome handles ~/ prefix", () => {
    const expanded = expandHome("~/Projects/foo");
    assert.ok(expanded.endsWith(`${path.sep}Projects${path.sep}foo`));
  });

  it("validateConfig assigns default color", () => {
    const cfg = validateConfig({
      profilesRoot: "~/.cursor-profiles",
      projects: { demo: { path: "~/Projects/demo" } },
    });
    assert.match(cfg.projects.demo.color, /^#[0-9a-fA-F]{6}$/);
  });

  it("validateConfig keeps custom baseUrl", () => {
    const cfg = validateConfig({
      baseUrl: "https://litellm.example.com/v1",
      projects: {},
    });
    assert.equal(cfg.baseUrl, "https://litellm.example.com/v1");
  });

  it("pickColorForName is stable", () => {
    assert.equal(pickColorForName("acme"), pickColorForName("acme"));
  });

  it("pickUnusedColor keeps preferred color when free", () => {
    assert.equal(pickUnusedColor("bucx", []), pickColorForName("bucx"));
  });

  it("isHexColor accepts #RRGGBB only", () => {
    assert.equal(isHexColor("#852e00"), true);
    assert.equal(isHexColor("#852E00"), true);
    assert.equal(isHexColor("852e00"), false);
    assert.equal(isHexColor("#852e0"), false);
    assert.equal(isHexColor("#852e000"), false);
    assert.equal(isHexColor(""), false);
    assert.equal(isHexColor(undefined), false);
  });

  it("pickUnusedColor avoids collision", () => {
    const taken = pickColorForName("bucx");
    const picked = pickUnusedColor("bucx", [taken]);
    assert.notEqual(picked, taken);
    assert.match(picked, /^#[0-9a-fA-F]{6}$/);
  });

  it("findProjectByPath picks longest match", () => {
    const home = expandHome("~");
    const cfg = validateConfig({
      profilesRoot: "~/.cursor-profiles",
      projects: {
        root: { path: path.join(home, "Projects") },
        nested: {
          path: path.join(home, "Projects", "acme-app"),
          color: "#4f8cff",
        },
      },
    });
    const hit = findProjectByPath(
      cfg,
      path.join(home, "Projects", "acme-app", "web"),
    );
    assert.equal(hit?.name, "nested");
  });
});

describe("config get", () => {
  it("returns baseUrl from a validated config", () => {
    const cfg = validateConfig({
      baseUrl: "https://litellm.example.com/v1",
      projects: {},
    });
    assert.equal(
      getConfigValue(cfg, "baseUrl"),
      "https://litellm.example.com/v1",
    );
  });

  it("returns profilesRoot verbatim", () => {
    const cfg = validateConfig({
      profilesRoot: "~/custom-root",
      projects: {},
    });
    assert.equal(getConfigValue(cfg, "profilesRoot"), "~/custom-root");
  });

  it("works on defaultConfig when no config file exists", () => {
    assert.equal(getConfigValue(defaultConfig(), "baseUrl"), "");
  });

  it("ships no built-in gateway URL (set your own via config baseUrl)", () => {
    assert.equal(defaultConfig().baseUrl, "");
    const cfg = validateConfig({ projects: {} });
    assert.equal(cfg.baseUrl, "");
  });

  it("throws on unknown key", () => {
    assert.throws(
      () => getConfigValue(defaultConfig(), "nope"),
      /Unknown config key: nope\. Known keys: baseUrl, profilesRoot/,
    );
  });

  it("throws on projects key", () => {
    assert.throws(
      () => getConfigValue(defaultConfig(), "projects"),
      /Unknown config key: projects/,
    );
  });

  it("CONFIG_GETTABLE_KEYS is baseUrl and profilesRoot", () => {
    assert.deepEqual(CONFIG_GETTABLE_KEYS, ["baseUrl", "profilesRoot"]);
  });
});
