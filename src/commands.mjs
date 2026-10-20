import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  baseUrlFragment,
  collapseHome,
  CONFIG_FILE,
  CONFIG_GETTABLE_KEYS,
  expandHome,
  findProjectByPath,
  getConfigValue,
  getProject,
  isHexColor,
  loadConfig,
  pickColorForName,
  pickUnusedColor,
  updateConfig,
  profileStateDb,
} from "./config.mjs";
import {
  blockSwatch,
  bold,
  dim,
  err,
  ok,
  printTable,
  reset,
  warn,
} from "./ansi.mjs";
import {
  SECRET_OPENAI_KEY,
  SUBAGENT_OVERRIDES_KEY,
  findCursorCli,
  listRunningCursorProfiles,
  mainCursorProfileRoot,
  mainCursorUserDir,
  stateDbHasKey,
  stateDbValueContains,
  stateDbValuesMatch,
  hasSqlite3,
} from "./detect.mjs";
import {
  cloneStateDb,
  createProfile,
  markSetupDone,
  needsFirstRunChecklist,
  printFirstRunChecklist,
  profileIntegrityChecks,
  writeProfileSettings,
} from "./profile.mjs";
import { setProfileApiKey } from "./keychain.mjs";

const ZSHRC_MARKER_START = "# >>> cursor-keys aliases >>>";
const ZSHRC_MARKER_END = "# <<< cursor-keys aliases <<<";
const ZSHRC_WRAP_START = "# >>> cursor-keys cursor wrapper >>>";
const ZSHRC_WRAP_END = "# <<< cursor-keys cursor wrapper <<<";

/**
 * @param {string[]} argv
 */
export async function runCommand(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "init":
      return cmdInit(rest);
    case "add":
      return cmdAdd(rest);
    case "open":
      return cmdOpen(rest);
    case "status":
      return cmdStatus(rest);
    case "current":
      return cmdCurrent(rest);
    case "config":
      return cmdConfig(rest);
    case "sync":
      return cmdSync(rest);
    case "doctor":
      return cmdDoctor(rest);
    case "aliases":
      return cmdAliases(rest);
    case "wrap":
      return cmdWrap(rest);
    case "__cursor-wrap":
      return cmdCursorWrap(rest);
    case "install-extension":
      return cmdInstallExtension(rest);
    case "set-key":
      return cmdSetKey(rest);
    case "color":
      return cmdColor(rest);
    case "clone":
      return cmdClone(rest);
    case "rm":
      return cmdRm(rest);
    case "ls":
      return cmdLs(rest);
    case "completion":
      return cmdCompletion(rest);
    default:
      throw new Error(`Unknown command: ${cmd}. Run cursor-keys --help`);
  }
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      flags.help = true;
    } else if (a === "--all") {
      flags.all = true;
    } else if (a === "--install") {
      flags.install = true;
    } else if (a === "--delete") {
      flags.delete = true;
    } else if (a === "--root" && args[i + 1]) {
      flags.root = args[++i];
    } else if (a === "--path" && args[i + 1]) {
      flags.path = args[++i];
    } else if (a === "--color" && args[i + 1]) {
      flags.color = args[++i];
    } else if (a === "--clone" && args[i + 1]) {
      flags.clone = args[++i];
    } else if (a === "--key" && args[i + 1]) {
      flags.key = args[++i];
    } else if (a === "--from" && args[i + 1]) {
      flags.from = args[++i];
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function scanGitRepos(rootDir, maxDepth = 2) {
  const root = path.resolve(expandHome(rootDir));
  if (!fs.existsSync(root)) return [];

  /** @type {string[]} */
  const repos = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const hasGit = entries.some((e) => e.isDirectory() && e.name === ".git");
    if (hasGit) {
      repos.push(dir);
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }

  walk(root, 0);
  return repos.sort();
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cmdConfig(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log(
      "Usage: cursor-keys config                      Show config summary",
    );
    console.log(
      "       cursor-keys config get <key>            Print one value (baseUrl, profilesRoot)",
    );
    console.log(
      "       cursor-keys config baseUrl <URL>        Set gateway base URL",
    );
    return;
  }
  const config = loadConfig();
  const [key, value] = positional;

  if (key === "get") {
    if (!value) {
      throw new Error(
        `Missing config key. Usage: cursor-keys config get <${CONFIG_GETTABLE_KEYS.join("|")}>`,
      );
    }
    console.log(getConfigValue(config, value));
    return;
  }

  if (!key) {
    const count = Object.keys(config.projects).length;
    console.log(
      `${bold}Config${reset} ${dim}(${collapseHome(CONFIG_FILE)})${reset}`,
    );
    console.log(
      `  baseUrl:      ${config.baseUrl || `${dim}(not set: cursor-keys config baseUrl <url>)${reset}`}`,
    );
    console.log(`  profilesRoot: ${config.profilesRoot}`);
    console.log(
      `  projects:     ${count} registered ${dim}(see cursor-keys status)${reset}`,
    );
    return;
  }

  if (key !== "baseUrl") {
    throw new Error(`Unknown config key: ${key}. Known keys: baseUrl`);
  }
  if (!value) {
    console.log(config.baseUrl);
    return;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid baseUrl: ${value} (example: https://gateway.example.com/v1)`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`baseUrl must start with http(s)://: ${value}`);
  }
  updateConfig((c) => {
    c.baseUrl = value;
  });
  console.log(ok(`baseUrl set: ${value}`));
  console.log(`${dim}doctor verifies this per profile.${reset}`);
}

async function cmdSync(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys sync [name]");
    return;
  }
  const config = loadConfig();
  const names = positional[0]
    ? [positional[0]]
    : Object.keys(config.projects).sort();
  if (!names.length) {
    console.log("No projects registered. Run: cursor-keys init");
    return;
  }
  for (const name of names) {
    const project = getProject(config, name);
    if (!project) throw new Error(`Unknown project: ${name}`);
    if (!fs.existsSync(project.profileDir)) {
      console.log(warn(`skip ${name}: profile missing (run add first)`));
      continue;
    }
    writeProfileSettings(project.profileDir, name, project.color);
    console.log(ok(`Synced settings from main -> ${name}`));
  }
  console.log(
    `${dim}Open Cursor windows reload settings automatically.${reset}`,
  );
}

async function cmdInit(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys init [--root DIR] [--all]");
    return;
  }
  const root =
    flags.root || positional[0] || path.join(os.homedir(), "Projects");
  const repos = scanGitRepos(root);
  if (!repos.length) {
    console.log(`No git repos found under ${root}`);
    return;
  }

  let selected = repos;
  if (!flags.all) {
    console.log(`Found ${repos.length} repos under ${root}:\n`);
    repos.forEach((r, i) => console.log(`  [${i + 1}] ${collapseHome(r)}`));
    console.log("\nEnter numbers to register (e.g. 1,3,5) or 'all':");
    const answer = await ask("> ");
    if (/^all$/i.test(answer)) {
      selected = repos;
    } else {
      const nums = answer
        .split(/[,\s]+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => n >= 1 && n <= repos.length);
      selected = [...new Set(nums)].map((n) => repos[n - 1]);
    }
  }

  updateConfig((config) => {
    for (const repo of selected) {
      const name = path.basename(repo);
      if (config.projects[name]) {
        console.log(warn(`Skip ${name} (already registered)`));
        continue;
      }
      config.projects[name] = {
        path: collapseHome(repo),
        color: pickColorForName(name),
      };
      console.log(ok(`Registered ${name}`));
    }
  });
  console.log(
    `\nNext: cursor-keys add <name> --clone main   (creates profile + copies main Cursor settings)`,
  );
}

function shouldShowFirstRunChecklist(profileDir) {
  if (!needsFirstRunChecklist(profileDir)) return false;
  const db = profileStateDb(profileDir);
  // A cloned profile already carries a key row: setup is effectively done.
  return !(fs.existsSync(db) && stateDbHasKey(db, SECRET_OPENAI_KEY));
}

async function cmdAdd(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log(
      "Usage: cursor-keys add <name> [--path REPO] [--color #RRGGBB] [--clone main|donorName]",
    );
    return;
  }
  const name = positional[0];
  if (!name)
    throw new Error("Missing project name. Usage: cursor-keys add <name>");

  const config = loadConfig();
  const repoPath = flags.path
    ? path.resolve(expandHome(flags.path))
    : config.projects[name]
      ? path.resolve(expandHome(config.projects[name].path))
      : path.resolve(process.cwd());

  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  const usedColors = Object.entries(config.projects)
    .filter(([other]) => other !== name)
    .map(([, entry]) => entry.color);
  const color =
    flags.color ||
    config.projects[name]?.color ||
    pickUnusedColor(name, usedColors);
  const saved = updateConfig((c) => {
    c.projects[name] = { path: collapseHome(repoPath), color };
  });

  const project = getProject(saved, name);
  if (!project) throw new Error("Failed to resolve project");

  let cloneFrom = null;
  if (flags.clone) {
    if (flags.clone === "main") {
      cloneFrom = mainCursorProfileRoot();
    } else {
      const donor = getProject(saved, flags.clone);
      if (!donor) throw new Error(`Unknown clone donor: ${flags.clone}`);
      cloneFrom = donor.profileDir;
    }
  }

  const { scrubbed } = createProfile({
    profileDir: project.profileDir,
    projectName: name,
    color,
    cloneFrom,
  });

  console.log(ok(`Profile ready: ${collapseHome(project.profileDir)}`));
  console.log(`  Repo:  ${collapseHome(project.path)}`);
  console.log(`  Color: ${color} ${blockSwatch(color)}`);
  if (cloneFrom) {
    console.log(
      `  ${dim}Scrubbed ${scrubbed} donor secret row(s) from the clone; sign-in retained.${reset}`,
    );
  }
  if (shouldShowFirstRunChecklist(project.profileDir)) {
    printFirstRunChecklist(name, config.baseUrl);
  }
}

async function cmdOpen(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys open [name]");
    return;
  }

  const cursor = findCursorCli();
  if (!cursor)
    throw new Error(
      "cursor CLI not found. Install from Cursor: Shell Command: Install 'cursor' in PATH",
    );

  const config = loadConfig();
  let name = positional[0];
  let project;
  if (name) {
    project = getProject(config, name);
    if (!project)
      throw new Error(`Unknown project: ${name}. Run cursor-keys init or add.`);
  } else {
    project = findProjectByPath(config, process.cwd());
    if (!project) {
      throw new Error(
        "No project matches cwd. Pass a name: cursor-keys open <name>",
      );
    }
    name = project.name;
  }

  if (!fs.existsSync(project.profileDir)) {
    throw new Error(`Profile missing. Run: cursor-keys add ${name}`);
  }

  // Refresh settings from main so every open picks up the latest tweaks.
  try {
    writeProfileSettings(project.profileDir, name, project.color);
  } catch {
    // Never block an open on a settings rewrite failure.
  }

  const child = spawn(
    cursor,
    ["--user-data-dir", project.profileDir, "--new-window", project.path],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  console.log(ok(`Opening ${name}`));
  console.log(`  ${dim}${collapseHome(project.path)}${reset}`);
  console.log(`  Profile ${blockSwatch(project.color)} ${project.color}`);

  if (shouldShowFirstRunChecklist(project.profileDir)) {
    printFirstRunChecklist(name, config.baseUrl);
    markSetupDone(project.profileDir);
  }
}

async function cmdStatus() {
  const config = loadConfig();
  const running = listRunningCursorProfiles();
  const names = Object.keys(config.projects).sort();

  if (!names.length) {
    console.log("No projects registered. Run: cursor-keys init");
    return;
  }

  const rows = names.map((name) => {
    const p = getProject(config, name);
    if (!p) return [name, "-", "-", "-", "-"];
    const profResolved = path.resolve(p.profileDir);
    const runCount = running.get(profResolved) || 0;
    const keyOk = fs.existsSync(profileStateDb(p.profileDir))
      ? stateDbHasKey(profileStateDb(p.profileDir), SECRET_OPENAI_KEY)
      : false;
    return [
      name,
      blockSwatch(p.color) + " " + p.color,
      runCount ? ok(String(runCount)) : `${dim}0${reset}`,
      keyOk ? ok("yes") : warn("no"),
      collapseHome(p.path),
    ];
  });

  printTable(["Project", "Color", "Windows", "Key", "Repo"], rows);
  if (!companionExtensionLinked()) {
    console.log(
      `\n${dim}Companion extension not linked: cursor-keys install-extension (status bar + wrong-window guard)${reset}`,
    );
  }
}

/**
 * Best-effort check that the companion extension is linked into Cursor.
 * Looks for the lubu.cursor-keys-* folder the extension manifest produces.
 */
function companionExtensionLinked() {
  try {
    const extDir = path.join(os.homedir(), ".cursor", "extensions");
    return fs
      .readdirSync(extDir)
      .some((d) => d.startsWith("lubu.cursor-keys"));
  } catch {
    return false;
  }
}

async function cmdCurrent() {
  const config = loadConfig();
  const project = findProjectByPath(config, process.cwd());
  if (!project) {
    console.log("cwd is not under any registered project path.");
    process.exit(1);
  }
  console.log(`${bold}Project:${reset} ${project.name}`);
  console.log(`${bold}Repo:${reset}    ${collapseHome(project.path)}`);
  console.log(`${bold}Profile:${reset} ${collapseHome(project.profileDir)}`);
  console.log(
    `${bold}Color:${reset}   ${blockSwatch(project.color)} ${project.color}`,
  );
  const db = profileStateDb(project.profileDir);
  const keyOk = stateDbHasKey(db, SECRET_OPENAI_KEY);
  console.log(
    `${bold}API key:${reset} ${keyOk ? ok("configured in profile") : warn("not set in profile yet")}`,
  );
}

async function cmdDoctor(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys doctor [name]");
    return;
  }

  const cursor = findCursorCli();
  console.log(
    cursor ? ok(`cursor CLI: ${cursor}`) : err("cursor CLI: not found"),
  );

  if (!hasSqlite3()) {
    console.log(warn("sqlite3 not on PATH (key checks limited)"));
  }

  const config = loadConfig();
  const names = positional[0]
    ? [positional[0]]
    : Object.keys(config.projects).sort();

  if (!names.length) {
    console.log("No projects to check.");
    return;
  }

  for (const name of names) {
    const p = getProject(config, name);
    if (!p) {
      console.log(err(`\n${name}: not in config`));
      continue;
    }
    console.log(`\n${bold}${name}${reset}`);
    for (const issue of profileIntegrityChecks(p.profileDir)) {
      console.log(`  ${err("✗")} ${issue}`);
    }
    const db = profileStateDb(p.profileDir);
    if (fs.existsSync(db)) {
      const hasKey = stateDbHasKey(db, SECRET_OPENAI_KEY);
      console.log(
        `  ${hasKey ? ok("✓") : warn("✗")} OpenAI API key row present`,
      );
      if (hasKey) {
        const mainDb = path.join(
          mainCursorUserDir(),
          "globalStorage",
          "state.vscdb",
        );
        if (stateDbValuesMatch(db, mainDb, SECRET_OPENAI_KEY)) {
          console.log(
            `  ${warn("!")} Key is identical to the main profile (inherited via clone); run: cursor-keys set-key ${name}`,
          );
        }
      }
      console.log(
        `  ${stateDbHasKey(db, SUBAGENT_OVERRIDES_KEY) ? ok("✓") : warn("✗")} Explore subagent overrides present`,
      );
      const fragment = baseUrlFragment(config);
      if (fragment) {
        console.log(
          `  ${stateDbValueContains(db, fragment) ? ok("✓") : warn("✗")} Base URL (${fragment}) in profile state`,
        );
      } else {
        console.log(
          `  ${dim}- baseUrl not set, skipping gateway check: cursor-keys config baseUrl <url>${reset}`,
        );
      }
    } else {
      console.log(`  ${warn("✗")} Open profile once: cursor-keys open ${name}`);
    }
  }
}

async function cmdAliases(args) {
  const { flags } = parseFlags(args);
  const config = loadConfig();
  const names = Object.keys(config.projects).sort();
  const lines = names.map(
    (n) => `alias ${sanitizeAlias(n)}='cursor-keys open ${shellEscapeName(n)}'`,
  );
  const block = [
    ZSHRC_MARKER_START,
    "alias ck='cursor-keys'",
    'eval "$(cursor-keys completion)"   # tab completion',
    ...lines,
    ZSHRC_MARKER_END,
  ].join("\n");

  if (!flags.install) {
    console.log(block);
    console.log(`\n${dim}Run: cursor-keys aliases --install${reset}`);
    return;
  }

  const zshrc = path.join(os.homedir(), ".zshrc");
  let content = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";
  const startIdx = content.indexOf(ZSHRC_MARKER_START);
  const endIdx = content.indexOf(ZSHRC_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1) {
    content =
      content.slice(0, startIdx) +
      block +
      content.slice(endIdx + ZSHRC_MARKER_END.length);
  } else {
    content = content.trimEnd() + "\n\n" + block + "\n";
  }
  fs.writeFileSync(zshrc, content, "utf8");
  console.log(ok(`Updated ${zshrc}`));
  if (!compinitLikelyConfigured(content)) {
    console.log(
      warn(
        "Note: tab completion needs compinit. If `cursor-keys open <TAB>` does nothing after sourcing ~/.zshrc, add: autoload -Uz compinit && compinit",
      ),
    );
  }
}

function sanitizeAlias(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

const COMPINIT_HINT_RE = /compinit|oh-my-zsh|prezto|zinit|antigen|zplug|zimfw/;

/**
 * Best-effort check that the user's zsh setup loads compinit. Frameworks
 * (oh-my-zsh, prezto, zinit, ...) run it from sourced files rather than
 * ~/.zshrc itself, and Warp injects it via shell integration, so a plain
 * text grep of ~/.zshrc alone gives false positives. Exported for tests.
 */
export function compinitLikelyConfigured(
  zshrcContent,
  termProgram = process.env.TERM_PROGRAM,
) {
  if (COMPINIT_HINT_RE.test(zshrcContent)) return true;
  return termProgram === "WarpTerminal";
}

function shellEscapeName(name) {
  return name.replace(/'/g, `'\\''`);
}

const COMPLETION_COMMANDS =
  "init add clone set-key color open status current config sync doctor aliases wrap install-extension completion ls rm";

/**
 * Pure builder for the zsh completion script. Sourced via
 * `eval "$(cursor-keys completion)"` from the aliases/wrap zshrc blocks,
 * so updates ship with `npm update` and never go stale on disk.
 */
export function completionScript() {
  return `#compdef cursor-keys ckeys ck
_cursor_keys() {
  local -a projects
  if (( CURRENT == 3 )) && [[ \${words[2]} == (open|clone|set-key|color|doctor|sync|rm) ]]; then
    projects=(\${(f)"$(cursor-keys ls 2>/dev/null)"})
    _describe 'project' projects
  else
    _arguments '1:command:(${COMPLETION_COMMANDS})'
  fi
}
compdef _cursor_keys cursor-keys ckeys ck
`;
}

function cmdCompletion(args) {
  const { flags } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys completion");
    console.log("Prints the zsh tab completion script to stdout.");
    console.log("Auto-sourced by `cursor-keys aliases --install`; no separate install needed.");
    return;
  }
  process.stdout.write(completionScript());
}

/**
 * Hidden command: bare project names, one per line, for completion/scripts.
 */
function cmdLs(args) {
  const { flags } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys ls");
    console.log("Prints registered project names, one per line (for scripts and tab completion).");
    return;
  }
  const config = loadConfig();
  console.log(Object.keys(config.projects).sort().join("\n"));
}

function installZshrcBlock(startMarker, endMarker, block) {
  const zshrc = path.join(os.homedir(), ".zshrc");
  let content = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    content =
      content.slice(0, startIdx) +
      block +
      content.slice(endIdx + endMarker.length);
  } else {
    content = content.trimEnd() + "\n\n" + block + "\n";
  }
  fs.writeFileSync(zshrc, content, "utf8");
  if (!compinitLikelyConfigured(content)) {
    console.log(
      warn(
        "Note: tab completion needs compinit. If `cursor-keys open <TAB>` does nothing after sourcing ~/.zshrc, add: autoload -Uz compinit && compinit",
      ),
    );
  }
  return zshrc;
}

async function cmdWrap(args) {
  const { flags } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys wrap [--install]");
    console.log(
      "Makes plain `cursor <path>` auto-use the right project profile.",
    );
    return;
  }
  const block = [
    ZSHRC_WRAP_START,
    'cursor() { cursor-keys __cursor-wrap "$@"; }',
    ZSHRC_WRAP_END,
  ].join("\n");

  if (!flags.install) {
    console.log(block);
    console.log(`\n${dim}Run: cursor-keys wrap --install${reset}`);
    return;
  }
  const zshrc = installZshrcBlock(ZSHRC_WRAP_START, ZSHRC_WRAP_END, block);
  console.log(ok(`Updated ${zshrc}`));
  console.log(`Run: source ~/.zshrc   (then plain \`cursor .\` just works)`);
  console.log(`${dim}Bypass anytime: CURSOR_KEYS_NO_WRAP=1 cursor .${reset}`);
}

/**
 * Hidden command: called by the zsh `cursor()` wrapper function.
 * Injects --user-data-dir when the target lives in a registered project,
 * otherwise delegates to the real cursor binary unchanged.
 */
async function cmdCursorWrap(args) {
  const real = findCursorCli();
  const delegate = () => {
    if (!real) {
      console.error("cursor-keys: real cursor binary not found");
      process.exit(127);
    }
    const child = spawn(real, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    child.on("error", () => process.exit(127));
  };

  if (!real) return delegate();
  if (process.env.CURSOR_KEYS_NO_WRAP) return delegate();
  if (args.some((a) => ["-h", "--help", "-v", "--version"].includes(a))) {
    return delegate();
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    return delegate();
  }

  let target = null;
  for (const a of args) {
    if (a.startsWith("-")) continue;
    const p = path.resolve(expandHome(a));
    if (fs.existsSync(p)) {
      target = p;
      break;
    }
  }
  if (!target) target = process.cwd();
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  const dir = stat?.isDirectory() ? target : path.dirname(target);

  const project = findProjectByPath(config, dir);
  if (!project || !fs.existsSync(project.profileDir)) return delegate();

  console.log(dim(`cursor-keys: profile "${project.name}"${reset}`));
  const child = spawn(real, ["--user-data-dir", project.profileDir, ...args], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", () => delegate());
}

async function cmdClone(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys clone <name> [--from main|otherProject]");
    return;
  }
  const name = positional[0];
  if (!name) throw new Error("Usage: cursor-keys clone <name>");

  const config = loadConfig();
  const project = getProject(config, name);
  if (!project) throw new Error(`Unknown project: ${name}`);

  const from = flags.from || "main";
  let donorRoot;
  if (from === "main") {
    donorRoot = mainCursorProfileRoot();
  } else {
    const donor = getProject(config, from);
    if (!donor) throw new Error(`Unknown donor project: ${from}`);
    donorRoot = donor.profileDir;
  }

  const scrubbed = cloneStateDb(donorRoot, project.profileDir);
  console.log(ok(`Cloned state from ${from} into ${name}`));
  console.log(
    `${dim}Scrubbed ${scrubbed} donor secret row(s) from the copy (API keys, MCP OAuth, extension secrets); sign-in retained.${reset}`,
  );
  console.log(
    `${dim}Settings and model config carried over. Now set the project key:${reset}`,
  );
  console.log(`  cursor-keys set-key ${name}`);
}

async function cmdInstallExtension() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const src = path.join(repoRoot, "extension");
  const extPkgPath = path.join(src, "package.json");
  if (!fs.existsSync(extPkgPath)) {
    throw new Error(`Extension source missing: ${src}`);
  }
  const extPkg = JSON.parse(fs.readFileSync(extPkgPath, "utf8"));
  const extDir = path.join(os.homedir(), ".cursor", "extensions");
  fs.mkdirSync(extDir, { recursive: true });
  const target = path.join(
    extDir,
    `${extPkg.publisher || "lubu"}.${extPkg.name}-${extPkg.version}`,
  );
  fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(src, target, "dir");
  console.log(ok(`Extension linked: ${target}`));
  console.log("Restart any open Cursor windows to load it.");
  console.log(`Look for ${bold}$(key) <project>${reset} in the status bar.`);
}

async function cmdColor(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys color <name> [#RRGGBB]");
    console.log("Show or set the project's title bar color.");
    return;
  }
  const name = positional[0];
  if (!name) throw new Error("Usage: cursor-keys color <name> [#RRGGBB]");
  const config = loadConfig();
  const project = getProject(config, name);
  if (!project) throw new Error(`Unknown project: ${name}. Run cursor-keys init or add.`);

  const hex = positional[1];
  if (!hex) {
    console.log(`${blockSwatch(project.color)} ${project.color}`);
    return;
  }
  if (!isHexColor(hex)) {
    throw new Error(`Invalid color: ${hex} (expected #RRGGBB, e.g. #852e00)`);
  }

  updateConfig((c) => {
    if (!c.projects[name]) throw new Error(`Unknown project: ${name}`);
    c.projects[name].color = hex;
  });
  if (fs.existsSync(project.profileDir)) {
    writeProfileSettings(project.profileDir, name, hex);
  }
  console.log(ok(`Color for ${name}: `) + `${blockSwatch(hex)} ${hex}`);
  console.log(`${dim}Open Cursor windows reload settings automatically.${reset}`);
}

/**
 * Read the API key from piped stdin. Only called when stdin is not an
 * interactive TTY; interactive runs get the hidden prompt instead.
 */
function readStdinKey() {
  return fs.readFileSync(0, "utf8").trim();
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = () => {};
    process.stdout.write(question);
    rl.question("", (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value.trim());
    });
  });
}

async function cmdSetKey(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys set-key <name>");
    console.log(
      "Writes the key into the profile's encrypted store (Cursor must",
    );
    console.log(
      "not have that profile window open). Hidden prompt when interactive;",
    );
    console.log("reads stdin when piped. No inline key flag exists:");
    console.log("shell history and process lists are not secret-safe.");
    return;
  }
  const name = positional[0];
  if (!name) throw new Error("Usage: cursor-keys set-key <name>");
  if (flags.key !== undefined) {
    throw new Error(
      `Inline --key is not accepted: shell history and process lists are not secret-safe. Use the hidden prompt or pipe stdin instead: op read op://vault/item/password | cursor-keys set-key ${name}`,
    );
  }

  const config = loadConfig();
  const project = getProject(config, name);
  if (!project) throw new Error(`Unknown project: ${name}`);

  const db = profileStateDb(project.profileDir);
  if (!fs.existsSync(db)) {
    throw new Error(
      `Profile has no state db yet. Run: cursor-keys clone ${name} (or open it once)`,
    );
  }
  if (listRunningCursorProfiles().has(path.resolve(project.profileDir))) {
    throw new Error(`Close the "${name}" Cursor window first, then retry.`);
  }

  let key;
  if (!process.stdin.isTTY) {
    key = readStdinKey();
  } else {
    console.log(
      `\nPaste the API key for ${bold}${name}${reset} below, then press Enter.`,
    );
    console.log(
      `${dim}Input is hidden: nothing echoes while you paste or type.${reset}`,
    );
    key = await promptHidden("API key: ");
  }
  if (!key) {
    throw new Error("No key entered. Aborted, nothing was written.");
  }
  const result = setProfileApiKey(db, key);
  console.log(
    ok(`Key set for ${name}`) +
      ` ${dim}(encrypted with Cursor safeStorage, round-trip verified, len ${result.length})${reset}`,
  );
}

async function cmdRm(args) {
  const { flags, positional } = parseFlags(args);
  if (flags.help) {
    console.log("Usage: cursor-keys rm <name> [--delete]");
    return;
  }
  const name = positional[0];
  if (!name) throw new Error("Usage: cursor-keys rm <name>");

  const config = loadConfig();
  if (!config.projects[name]) throw new Error(`Unknown project: ${name}`);

  const p = getProject(config, name);
  updateConfig((c) => {
    delete c.projects[name];
  });
  console.log(ok(`Removed ${name} from config`));

  if (flags.delete && p) {
    fs.rmSync(p.profileDir, { recursive: true, force: true });
    console.log(ok(`Deleted profile dir ${collapseHome(p.profileDir)}`));
  }
}
