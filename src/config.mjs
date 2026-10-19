import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_CONFIG_DIR = path.join(
  os.homedir(),
  ".config",
  "cursor-keys",
);
export const CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, "config.json");

/**
 * Resolved at call time so tests and scripts can point cursor-keys at a
 * scratch config via CURSOR_KEYS_CONFIG_FILE.
 */
function configFilePath() {
  const override = process.env.CURSOR_KEYS_CONFIG_FILE;
  return override ? expandHome(override) : CONFIG_FILE;
}
export const DEFAULT_PROFILES_ROOT = path.join(
  os.homedir(),
  ".cursor-profiles",
);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** @param {unknown} s */
export function isHexColor(s) {
  return typeof s === "string" && HEX_COLOR.test(s);
}

/** @param {string} p */
export function expandHome(p) {
  if (!p || typeof p !== "string") return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** @param {string} p */
export function collapseHome(p) {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
  return p;
}

export function defaultConfig() {
  return {
    profilesRoot: collapseHome(DEFAULT_PROFILES_ROOT),
    baseUrl: "https://connect.iobonzai.com/cursor",
    projects: {},
  };
}

export function loadConfig() {
  const file = configFilePath();
  if (!fs.existsSync(file)) {
    return defaultConfig();
  }
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  return validateConfig(data);
}

export function saveConfig(config) {
  const validated = validateConfig(config);
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Atomic write: a crash or concurrent reader never sees a torn file.
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return validated;
}

/**
 * Load fresh, mutate, save: the only safe way to change config. Keeps the
 * lost-update window (two concurrent runs dropping each other's projects)
 * down to the few ms inside this function instead of a whole command run.
 * @param {(config: ReturnType<typeof loadConfig>) => void} mutate
 */
export function updateConfig(mutate) {
  const config = loadConfig();
  mutate(config);
  return saveConfig(config);
}

/**
 * @param {unknown} data
 */
export function validateConfig(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid config: expected object");
  }
  const profilesRoot =
    typeof data.profilesRoot === "string"
      ? data.profilesRoot
      : collapseHome(DEFAULT_PROFILES_ROOT);
  const baseUrl =
    typeof data.baseUrl === "string" && data.baseUrl
      ? data.baseUrl
      : "https://connect.iobonzai.com/cursor";
  const projects = {};
  if (data.projects && typeof data.projects === "object") {
    for (const [name, entry] of Object.entries(data.projects)) {
      if (!name || typeof entry !== "object" || !entry) continue;
      const repoPath = typeof entry.path === "string" ? entry.path : "";
      const color = typeof entry.color === "string" ? entry.color : "";
      if (!repoPath) throw new Error(`Project "${name}" missing path`);
      if (color && !HEX_COLOR.test(color)) {
        throw new Error(`Project "${name}" invalid color (use #RRGGBB)`);
      }
      projects[name] = {
        path: repoPath,
        color: color || pickColorForName(name),
      };
    }
  }
  return { profilesRoot, baseUrl, projects };
}

/** "https://connect.iobonzai.com/cursor" -> "connect.iobonzai.com/cursor" */
export function baseUrlFragment(config) {
  return String(config.baseUrl || "").replace(/^https?:\/\//, "");
}

export const CONFIG_GETTABLE_KEYS = ["baseUrl", "profilesRoot"];

/**
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string} key
 */
export function getConfigValue(config, key) {
  if (!CONFIG_GETTABLE_KEYS.includes(key)) {
    throw new Error(
      `Unknown config key: ${key}. Known keys: ${CONFIG_GETTABLE_KEYS.join(", ")}`,
    );
  }
  return config[key];
}

const COLOR_PALETTE = [
  "#4f8cff",
  "#ff6b6b",
  "#51cf66",
  "#ffd43b",
  "#845ef7",
  "#20c997",
  "#ff922b",
  "#e64980",
  "#339af0",
  "#94d82d",
];

/** Deterministic palette color from project name */
export function pickColorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

/** Like pickColorForName, but avoids colors already used by other projects */
export function pickUnusedColor(name, usedColors) {
  const used = new Set(usedColors);
  const preferred = pickColorForName(name);
  if (!used.has(preferred)) return preferred;
  return COLOR_PALETTE.find((c) => !used.has(c)) || preferred;
}

/**
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string} name
 */
export function getProject(config, name) {
  const entry = config.projects[name];
  if (!entry) return null;
  return {
    name,
    path: path.resolve(expandHome(entry.path)),
    color: entry.color,
    profileDir: path.join(expandHome(config.profilesRoot), name),
  };
}

/**
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string} cwd
 */
export function findProjectByPath(config, cwd) {
  const resolved = path.resolve(cwd);
  let best = null;
  let bestLen = 0;
  for (const [name, entry] of Object.entries(config.projects)) {
    const repo = path.resolve(expandHome(entry.path));
    if (resolved === repo || resolved.startsWith(repo + path.sep)) {
      if (repo.length > bestLen) {
        bestLen = repo.length;
        best = name;
      }
    }
  }
  return best ? getProject(config, best) : null;
}

export function profileUserDir(profileDir) {
  return path.join(profileDir, "User");
}

export function profileStateDb(profileDir) {
  return path.join(profileUserDir(profileDir), "globalStorage", "state.vscdb");
}

export function profileSettingsPath(profileDir) {
  return path.join(profileUserDir(profileDir), "settings.json");
}
