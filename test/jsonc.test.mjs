import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonc, stripJsonc } from "../src/jsonc.mjs";

describe("jsonc", () => {
  it("strips line comments outside strings", () => {
    const raw = `{ "a": 1 // comment\n, "b": 2 }`;
    const parsed = JSON.parse(stripJsonc(raw));
    assert.equal(parsed.a, 1);
    assert.equal(parsed.b, 2);
  });

  it("does not strip // inside strings", () => {
    const raw = `{ "url": "https://x.com // not a comment" }`;
    const parsed = parseJsonc(raw);
    assert.equal(parsed.url, "https://x.com // not a comment");
  });

  it("removes trailing commas", () => {
    const raw = `{ "a": 1, "b": [1,2,], }`;
    const parsed = parseJsonc(raw);
    assert.deepEqual(parsed, { a: 1, b: [1, 2] });
  });
});
