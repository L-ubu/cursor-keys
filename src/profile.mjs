import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  profileSettingsPath,
  profileStateDb,
  profileUserDir,
} from "./config.mjs";
import { parseJsonc } from "./jsonc.mjs";
import { listRunningCursorProfiles, mainCursorUserDir } from "./detect.mjs";

const SETUP_MARKER = ".cursor-keys-setup-done";

export function ensureProfileStructure(profileDir) {
  const userDir = profileUserDir(profileDir);
  fs.mkdirSync(path.join(userDir, "globalStorage"), { recursive: true });
  return userDir;
}

/**
 * @param {string} profileDir
 * @param {string} projectName
 * @param {string} color
 */
export function writeProfileSettings(profileDir, projectName, color) {
  const userDir = ensureProfileStructure(profileDir);
  const mainSettings = path.join(mainCursorUserDir(), "settings.json");
  let base = {};
  if (fs.existsSync(mainSettings)) {
    const raw = fs.readFileSync(mainSettings, "utf8");
    try {
      base = parseJsonc(raw);
    } catch {
      base = {};
    }
  }
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    base = {};
  }

  const colorCustom = {
    ...(base.workbench?.colorCustomizations || {}),
    "titleBar.activeBackground": color,
    "titleBar.activeForeground": "#ffffff",
    "titleBar.inactiveBackground": color + "99",
    "titleBar.inactiveForeground": "#ffffffcc",
  };

  base.window = {
    ...(base.window || {}),
    title: `${projectName} — \${activeEditorShort}\${separator}\${rootName}`,
  };
  base.workbench = {
    ...(base.workbench || {}),
    colorCustomizations: colorCustom,
  };

  const outPath = profileSettingsPath(profileDir);
  fs.writeFileSync(outPath, JSON.stringify(base, null, 2) + "\n", "utf8");
}

export function symlinkSharedUserFiles(profileDir) {
  const userDir = profileUserDir(profileDir);
  const mainUser = mainCursorUserDir();
  const links = ["keybindings.json", "snippets"];
  for (const name of links) {
    const src = path.join(mainUser, name);
    const dest = path.join(userDir, name);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) {
      try {
        const st = fs.lstatSync(dest);
        if (st.isSymbolicLink()) fs.unlinkSync(dest);
        else continue;
      } catch {
        continue;
      }
    }
    fs.symlinkSync(src, dest);
  }
}

/**
 * Row patterns scrubbed from every cloned state DB. Donor secrets (API keys,
 * MCP OAuth tokens, extension secrets) never propagate into project profiles.
 * The Cursor sign-in session (cursorAuth/*) intentionally stays: profiles
 * open signed-in, which is the whole point of clone.
 */
export const CLONE_SCRUB_LIKE_PATTERNS = ["secret://%", "mcpOAuth.%"];

/**
 * @param {string} donorProfileDir - main Cursor or another profile root (parent of User)
 * @param {string} targetProfileDir
 * @returns {number} how many donor secret rows were scrubbed from the copy
 */
export function cloneStateDb(donorProfileDir, targetProfileDir) {
  const runningProfiles = listRunningCursorProfiles();
  if (runningProfiles.has(path.resolve(targetProfileDir))) {
    throw new Error(
      `Profile is currently running: ${targetProfileDir}. Close that window first.`,
    );
  }
  let donorRoot = donorProfileDir;
  if (
    fs.existsSync(
      path.join(donorProfileDir, "User", "globalStorage", "state.vscdb"),
    )
  ) {
    donorRoot = donorProfileDir;
  } else if (
    fs.existsSync(
      path.join(mainCursorUserDir(), "globalStorage", "state.vscdb"),
    )
  ) {
    donorRoot = path.dirname(mainCursorUserDir());
  } else {
    throw new Error(`Donor profile has no state.vscdb: ${donorProfileDir}`);
  }

  const src = path.join(donorRoot, "User", "globalStorage", "state.vscdb");
  const dest = profileStateDb(targetProfileDir);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing donor state database: ${src}`);
  }
  ensureProfileStructure(targetProfileDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // VACUUM INTO requires a fresh destination.
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(dest + suffix, { force: true });
  }

  // VACUUM INTO snapshots a consistent copy even while the donor Cursor is
  // running; `.backup` can spin at full CPU against a write-heavy donor.
  execSync(`sqlite3 ${shellQuote(src)} "VACUUM INTO ${shellQuote(dest)}"`, {
    stdio: "ignore",
  });

  return scrubClonedSecrets(dest);
}

/**
 * Delete donor secret rows from a freshly cloned state DB (keys only, values
 * are never read). Returns the number of deleted rows.
 * @param {string} stateDbPath
 */
export function scrubClonedSecrets(stateDbPath) {
  let scrubbed = 0;
  for (const pattern of CLONE_SCRUB_LIKE_PATTERNS) {
    const out = execFileSync(
      "sqlite3",
      [
        stateDbPath,
        `DELETE FROM ItemTable WHERE key LIKE '${pattern}'; SELECT changes();`,
      ],
      { encoding: "utf8" },
    );
    scrubbed += parseInt(out.trim(), 10) || 0;
  }
  return scrubbed;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function markSetupDone(profileDir) {
  fs.writeFileSync(
    path.join(profileDir, SETUP_MARKER),
    new Date().toISOString() + "\n",
  );
}

export function needsFirstRunChecklist(profileDir) {
  return !fs.existsSync(path.join(profileDir, SETUP_MARKER));
}

/**
 * @param {string} projectName
 * @param {string} baseUrl
 * @param {string} platform Node process.platform
 */
export function buildFirstRunChecklist(
  projectName,
  baseUrl = "",
  platform = process.platform,
) {
  const gateway = baseUrl || "https://gateway.example.com/v1";
  const gatewayStep = baseUrl
    ? ""
    : `  cursor-keys config baseUrl <your-gateway-url>   # one-time, e.g. ${gateway}\n`;
  if (platform === "darwin") {
    return `
First-time setup for "${projectName}" · copy-paste in order:

${gatewayStep}  cursor-keys clone ${projectName}    # inherit sign-in, settings, model config from main Cursor
  cursor-keys set-key ${projectName}  # inject the project API key (encrypted, hidden prompt)
  cursor-keys doctor ${projectName}   # verify the profile

Manual alternative: Cursor Settings → Models → API keys, paste the key under
OpenAI API Key, enable "Override OpenAI Base URL" with: ${gateway}

Already inside this profile's window? Close it before running clone or set-key.
`;
  }

  return `
First-time setup for "${projectName}" · copy-paste in order:

${gatewayStep}  cursor-keys clone ${projectName}    # inherit sign-in, settings, model config from main Cursor
  cursor-keys open ${projectName}     # open once so Cursor creates its state
  cursor-keys doctor ${projectName}   # verify the profile

Then in that window: Cursor Settings → Models → API keys, paste the key under
OpenAI API Key, enable "Override OpenAI Base URL" with: ${gateway}

Already inside this profile's window? Close it before running clone.
`;
}

export function printFirstRunChecklist(
  projectName,
  baseUrl = "https://gateway.example.com/v1",
) {
  console.log(buildFirstRunChecklist(projectName, baseUrl, process.platform));
}

export function createProfile({ profileDir, projectName, color, cloneFrom }) {
  fs.mkdirSync(profileDir, { recursive: true });
  writeProfileSettings(profileDir, projectName, color);
  symlinkSharedUserFiles(profileDir);
  let scrubbed = 0;
  if (cloneFrom) {
    scrubbed = cloneStateDb(cloneFrom, profileDir);
  }
  return { scrubbed };
}

export function profileIntegrityChecks(profileDir) {
  const issues = [];
  const settings = profileSettingsPath(profileDir);
  const stateDb = profileStateDb(profileDir);
  if (!fs.existsSync(settings)) issues.push("missing settings.json");
  if (!fs.existsSync(stateDb))
    issues.push("missing state.vscdb (open Cursor once in this profile)");
  const kb = path.join(profileUserDir(profileDir), "keybindings.json");
  if (fs.existsSync(kb)) {
    try {
      if (!fs.lstatSync(kb).isSymbolicLink()) {
        issues.push("keybindings.json is not a symlink to main profile");
      }
    } catch {
      /* ignore */
    }
  }
  return issues;
}
