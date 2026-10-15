// Postinstall: one-time hint + best-effort companion extension install.
// Never breaks the install: the whole body is guarded and exits 0.
// Quiet installs: CURSOR_KEYS_NO_POSTINSTALL=1
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  if (process.env.CURSOR_KEYS_NO_POSTINSTALL) process.exit(0);
  const yellow = "\x1b[33m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  const pkgRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const extSrc = path.join(pkgRoot, "extension");
  const extPkgPath = path.join(extSrc, "package.json");
  const cursorDir = path.join(os.homedir(), ".cursor");

  // Auto-link the companion extension on global installs when Cursor exists.
  let extLine = "";
  const isGlobal = process.env.npm_config_global === "true";
  if (isGlobal && fs.existsSync(cursorDir) && fs.existsSync(extPkgPath)) {
    try {
      const extPkg = JSON.parse(fs.readFileSync(extPkgPath, "utf8"));
      const extDir = path.join(cursorDir, "extensions");
      fs.mkdirSync(extDir, { recursive: true });
      const target = path.join(
        extDir,
        `${extPkg.publisher || "lubu"}.${extPkg.name}-${extPkg.version}`,
      );
      fs.rmSync(target, { recursive: true, force: true });
      try {
        fs.symlinkSync(extSrc, target, "dir");
      } catch {
        fs.cpSync(extSrc, target, { recursive: true });
      }
      extLine = `\n  Cursor extension linked ${dim}· restart Cursor, then Cmd+Shift+P: "cursor-keys: Open Project..."${reset}`;
    } catch {
      extLine = `\n  cursor-keys install-extension   link the Cursor extension (status bar + warnings)`;
    }
  }

  console.log(`
${yellow}cursor-keys installed${reset}

  cursor-keys --help              commands
  cursor-keys aliases --install   aliases, 'ck' shortcut, tab completion
  cursor-keys wrap --install      plain 'cursor <path>' picks the profile
${extLine}
${dim}Quiet installs: CURSOR_KEYS_NO_POSTINSTALL=1${reset}
`);
} catch {
  /* postinstall must never break install */
}
