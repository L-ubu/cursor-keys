import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blockSwatch,
  ok,
  padEnd,
  printTable,
  stripAnsi,
  warn,
} from "../src/ansi.mjs";

describe("ansi", () => {
  it("stripAnsi removes SGR color codes", () => {
    assert.equal(stripAnsi(ok("yes")), "yes");
    assert.equal(stripAnsi(warn("no")), "no");
  });

  it("stripAnsi removes 48;2 background sequences from blockSwatch", () => {
    assert.equal(stripAnsi(blockSwatch("#4f8cff")), "  ");
  });

  it("padEnd pads to visible width with colored input", () => {
    const padded = padEnd(ok("yes"), 10);
    assert.equal(stripAnsi(padded).length, 10);
    assert.ok(padded.endsWith("       "));
  });

  it("printTable keeps rows aligned with ANSI cells", () => {
    const lines = [];
    const orig = console.log;
    console.log = (s) => lines.push(String(s));
    try {
      printTable(
        ["A", "B"],
        [
          ["short", ok("yes")],
          ["a-much-longer-cell", warn("no")],
        ],
      );
    } finally {
      console.log = orig;
    }
    assert.equal(lines.length, 4);
    const vis = lines.map((l) => stripAnsi(l).length);
    assert.equal(vis[0], vis[2]);
    assert.equal(vis[0], vis[3]);
    assert.ok(lines[1].startsWith("-".repeat("a-much-longer-cell".length)));
  });
});
