import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandHome,
  pickColorForName,
  validateConfig,
  findProjectByPath,
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
    assert.equal(pickColorForName("jlr_mss"), pickColorForName("jlr_mss"));
  });

  it("findProjectByPath picks longest match", () => {
    const home = expandHome("~");
    const cfg = validateConfig({
      profilesRoot: "~/.cursor-profiles",
      projects: {
        root: { path: path.join(home, "Projects") },
        nested: { path: path.join(home, "Projects", "jlr_mss") },
      },
    });
    const hit = findProjectByPath(
      cfg,
      path.join(home, "Projects", "jlr_mss", "web"),
    );
    assert.equal(hit?.name, "nested");
  });
});
