import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFirstRunChecklist } from "../src/profile.mjs";

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
});
