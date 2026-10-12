const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CONFIG_FILE = path.join(
  os.homedir(),
  ".config",
  "cursor-keys",
  "config.json",
);

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The profile root this window runs in, derived from globalStorageUri:
 * <profileRoot>/User/globalStorage/<publisher>.<name>
 */
function currentProfileRoot(context) {
  const fsPath = context.globalStorageUri.fsPath;
  const marker = path.sep + "User" + path.sep + "globalStorage" + path.sep;
  const idx = fsPath.indexOf(marker);
  return idx === -1 ? null : fsPath.slice(0, idx);
}

function projectForFolder(config, folder) {
  let best = null;
  let bestLen = 0;
  for (const [name, entry] of Object.entries(config.projects || {})) {
    if (!entry || typeof entry.path !== "string") continue;
    const repo = path.resolve(expandHome(entry.path));
    if (folder === repo || folder.startsWith(repo + path.sep)) {
      if (repo.length > bestLen) {
        best = name;
        bestLen = repo.length;
      }
    }
  }
  return best;
}

function profileDirFor(config, name) {
  return path.join(expandHome(config.profilesRoot), name);
}

function findCursorBinary() {
  // App-bundle CLI first: ~/.local/bin/cursor is a PATH-dependent shim that
  // fails in the extension host's minimal GUI environment.
  const candidates = [
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    "/usr/local/bin/cursor",
    "/opt/homebrew/bin/cursor",
    path.join(os.homedir(), ".local", "bin", "cursor"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "cursor";
}

function launch(profileDir, folder) {
  const bin = findCursorBinary();
  const child = spawn(
    bin,
    ["--user-data-dir", profileDir, "--new-window", folder],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  let warned = false;

  function relaunch(projectName, folder) {
    const config = loadConfig();
    if (!config) return;
    launch(profileDirFor(config, projectName), folder);
    setTimeout(() => {
      vscode.commands.executeCommand("workbench.action.closeWindow");
    }, 1500);
  }

  function update() {
    const config = loadConfig();
    if (!config) {
      statusBar.hide();
      return;
    }
    const profileRoot = currentProfileRoot(context);
    if (!profileRoot) {
      statusBar.hide();
      return;
    }

    const folders =
      vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [];
    let expected = null;
    let expectedFolder = null;
    for (const f of folders) {
      const p = projectForFolder(config, f);
      if (p) {
        expected = p;
        expectedFolder = f;
        break;
      }
    }

    const profilesRoot = path.resolve(expandHome(config.profilesRoot));
    const resolvedRoot = path.resolve(profileRoot);
    const inManagedProfile =
      resolvedRoot.startsWith(profilesRoot + path.sep) ||
      resolvedRoot === profilesRoot;
    const activeProfileName = inManagedProfile
      ? path.basename(resolvedRoot)
      : null;

    if (expected) {
      const expectedDir = path.resolve(profileDirFor(config, expected));
      if (resolvedRoot === expectedDir) {
        statusBar.text = `$(key) ${expected}`;
        statusBar.tooltip = `cursor-keys: this window bills "${expected}"`;
        statusBar.backgroundColor = undefined;
        statusBar.command = "cursor-keys.openProject";
        statusBar.show();
        return;
      }

      statusBar.text = `$(warning) wrong key: expected ${expected}`;
      statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
      statusBar.tooltip = `"${path.basename(expectedFolder)}" belongs to "${expected}", but this window uses ${
        activeProfileName ? `"${activeProfileName}"` : "the default profile"
      }. Click to relaunch.`;
      statusBar.command = "cursor-keys.relaunchHere";
      statusBar.show();

      if (!warned) {
        warned = true;
        vscode.window
          .showWarningMessage(
            `cursor-keys: this folder belongs to project "${expected}", but this window uses ${
              activeProfileName
                ? `the "${activeProfileName}" profile`
                : "the default profile"
            }. API calls would bill the wrong project.`,
            "Relaunch correctly",
            "Ignore",
          )
          .then((choice) => {
            if (choice === "Relaunch correctly") {
              relaunch(expected, expectedFolder);
            }
          });
      }
      return;
    }

    if (activeProfileName) {
      statusBar.text = `$(key) ${activeProfileName}`;
      statusBar.tooltip = `cursor-keys: window profile "${activeProfileName}" (this folder is not registered)`;
      statusBar.backgroundColor = undefined;
      statusBar.command = "cursor-keys.openProject";
      statusBar.show();
      return;
    }

    statusBar.hide();
  }

  context.subscriptions.push(
    statusBar,
    vscode.workspace.onDidChangeWorkspaceFolders(update),
    vscode.commands.registerCommand("cursor-keys.relaunchHere", () => {
      const config = loadConfig();
      if (!config) return;
      const folders =
        vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [];
      for (const f of folders) {
        const p = projectForFolder(config, f);
        if (p) {
          relaunch(p, f);
          return;
        }
      }
    }),
    vscode.commands.registerCommand("cursor-keys.openProject", async () => {
      const config = loadConfig();
      if (!config || !config.projects) {
        vscode.window.showInformationMessage(
          "cursor-keys: no config found. Run `cursor-keys init` in a terminal.",
        );
        return;
      }
      const names = Object.keys(config.projects).sort();
      if (!names.length) {
        vscode.window.showInformationMessage(
          "cursor-keys: no projects registered yet.",
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        names.map((n) => ({
          label: n,
          description: config.projects[n].path,
        })),
        { placeHolder: "Open project in its own Cursor profile" },
      );
      if (!picked) return;
      launch(
        profileDirFor(config, picked.label),
        path.resolve(expandHome(config.projects[picked.label].path)),
      );
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(CONFIG_FILE);
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(update),
    watcher.onDidCreate(update),
  );

  update();
}

function deactivate() {}

module.exports = { activate, deactivate };
