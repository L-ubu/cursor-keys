import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completionScript } from "../src/commands.mjs";

describe("completionScript", () => {
  const script = completionScript();

  it("emits a zsh compdef header for all binary names", () => {
    assert.match(script, /^#compdef cursor-keys ckeys ck/m);
    assert.match(script, /compdef _cursor_keys cursor-keys ckeys ck/);
  });

  it("completes the full command list via _arguments", () => {
    assert.match(script, /_arguments '1:command:\(init add clone set-key open status current config sync doctor aliases wrap install-extension completion ls rm\)'/);
  });

  it("completes project names for the project-scoped commands", () => {
    assert.match(script, /open\|clone\|set-key\|doctor\|sync\|rm/);
    assert.match(script, /cursor-keys ls 2>\/dev\/null/);
  });
});
