import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUserDataDirFromCommandLine } from "../src/detect.mjs";

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
});
