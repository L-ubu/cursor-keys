<div align="center">

```
 ██████╗██╗   ██╗██████╗ ███████╗ ██████╗ ██████╗     ██╗  ██╗███████╗██╗   ██╗███████╗
██╔════╝██║   ██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗    ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔════╝
██║     ██║   ██║██████╔╝███████╗██║   ██║██████╔╝    █████╔╝ █████╗   ╚████╔╝ ███████╗
██║     ██║   ██║██╔══██╗╚════██║██║   ██║██╔══██╗    ██╔═██╗ ██╔══╝    ╚██╔╝  ╚════██║
╚██████╗╚██████╔╝██║  ██║███████║╚██████╔╝██║  ██║    ██║  ██╗███████╗   ██║   ███████║
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝
```

**Per-project Cursor profiles so every window uses the right BYOK API key.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-5FA04E.svg)](https://nodejs.org)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](#development)

[Website](https://l-ubu.github.io/cursor-keys/) · [Install](#install) · [Commands](#commands) · [Config](#config)

</div>

---

Cursor stores your OpenAI-compatible API key (LiteLLM, Vercel AI Gateway, corporate proxy, ...) **once per profile**, not per repo. If you bill five client projects, you either babysit Settings all day or bill the wrong project. `cursor-keys` gives each project its own isolated profile and makes opening, switching, and checking keys automatic.

```
$ cursor-keys status

  Project   | Color    | Windows | Key | Repo
  ----------+----------+---------+-----+------------------
  acme      | #4f8cff  | 1       | yes | ~/Projects/acme
  client-a  | #51cf66  | 0       | no  | ~/Projects/client-a
  client-b  | #845ef7  | 1       | yes | ~/Projects/client-b

$ cursor-keys doctor acme

  ✓ OpenAI API key row present
  ✓ Explore subagent overrides present
  ✓ Base URL (gateway.example.com/v1) in profile state
```

## Install

```bash
npm install -g cursor-keys
# or from source: git clone https://github.com/L-ubu/cursor-keys && cd cursor-keys && npm link
```

Requires Node ≥18, the Cursor CLI (`Shell Command: Install 'cursor' in PATH`), and sqlite3 (preinstalled on macOS). Key injection is macOS-only; everything else is cross-platform shaped.

On global install, the companion Cursor extension is linked into `~/.cursor/extensions` automatically and a one-time hint prints (opt out of both: `CURSOR_KEYS_NO_POSTINSTALL=1`). Restart Cursor, then `Cmd+Shift+P` → "cursor-keys: Open Project...".

## Quick start

```bash
# one-time: point at your OpenAI-compatible gateway
cursor-keys config baseUrl https://gateway.example.com/v1

# one-time per project
cursor-keys add acme --path ~/Projects/acme     # register + create profile
cursor-keys clone acme                          # inherit sign-in, settings, model config from main Cursor
cursor-keys set-key acme                        # hidden prompt, key written encrypted (Cursor's own safeStorage)

# daily use (pick your style)
cursor .                                        # transparent wrapper injects the right profile
acme                                            # shell alias
# or Cmd+Shift+P -> "cursor-keys: Open Project..." inside Cursor
```

One-time extras for the full experience:

```bash
cursor-keys wrap --install        # plain `cursor <path>` auto-picks the profile
cursor-keys aliases --install     # per-project aliases, `ck` shortcut, zsh tab completion
cursor-keys install-extension     # status bar + wrong-window guard (auto-linked on global npm install)
```

## How it works

One window, one profile, one key. Each project gets an isolated `--user-data-dir` under `~/.cursor-profiles/<name>/`, which is the only way Cursor can hold two API keys at once. Extensions, MCP config, keybindings, and snippets stay shared (symlinked); secrets and sign-in isolate, which is exactly the split you want.

Settings flow one way, main to profiles: `sync` re-copies your main `settings.json` into every profile and re-applies that profile's title bar color on top. `open` does this automatically before every launch, and open windows hot-reload the file, so tweaks in your main Cursor show up everywhere. Changes made inside a profile window are overwritten on the next sync.

`clone` copies your main Cursor state (SQLite backup) so profiles open signed-in with your theme and model config. `set-key` encrypts your project key with Cursor's own safeStorage (Chromium OSCrypt, key from the "Cursor Safe Storage" macOS Keychain item) and writes it into the profile's secret store, round-trip verified. macOS asks for Keychain permission once; click Always Allow.

## "Which key am I on?" in three layers

1. **Title bar color** per project, injected into each profile's settings
2. **Status bar item** from the companion extension: `$(key) acme` when correct, warning + one-click relaunch when you open a repo in the wrong window
3. **`cursor-keys status` / `current`** in the terminal

## Commands

| Command                                        | What it does                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `init [--root DIR] [--all]`                    | Discover git repos and register them                            |
| `add <name> [--path] [--color] [--clone main]` | Create a project profile                                        |
| `clone <name> [--from main]`                   | Copy sign-in + settings + model config from a donor profile     |
| `set-key <name> [--key sk-...]`                | Inject the project API key (encrypted, verified)                |
| `color <name> [#hex]`                          | Show or set the project title bar color                         |
| `open [name]`                                  | Launch Cursor with the profile (auto-detect from cwd)           |
| `status`                                       | Projects, colors, running windows, key configured               |
| `current`                                      | Mapping for the current directory                               |
| `config [get <key> · baseUrl [URL]]`           | Show summary, print one value, or set the gateway base URL      |
| `sync [name]`                                  | Re-copy main Cursor settings into profiles                      |
| `doctor [name]`                                | Health checks: key row, base URL, subagent overrides            |
| `wrap [--install]`                             | zsh function so plain `cursor <path>` auto-picks the profile    |
| `aliases [--install]`                          | Per-project shell aliases (also `ck` shortcut + tab completion) |
| `completion`                                   | Print zsh tab completion (auto-sourced by `aliases --install`)  |
| `install-extension`                            | Link the Cursor extension (auto-linked on global npm install)   |
| `rm <name> [--delete]`                         | Unregister (optionally delete the profile)                      |

`cursor-keys ls` prints registered project names one per line for scripts and tab completion; it is hidden from `--help`.

## Config

`~/.config/cursor-keys/config.json` (writes are atomic and merge-on-save, so overlapping runs never clobber registrations):

```json
{
  "profilesRoot": "~/.cursor-profiles",
  "baseUrl": "https://gateway.example.com/v1",
  "projects": {
    "acme": { "path": "~/Projects/acme", "color": "#4f8cff" }
  }
}
```

`baseUrl` is your gateway's OpenAI-compatible endpoint. `doctor` verifies it per profile.

Read a single value for scripts (stdout only, exit 1 on unknown keys):

```bash
cursor-keys config get baseUrl
cursor-keys config get profilesRoot
```

## Security

- Keys go **straight into Cursor's own encrypted store** (`secret://cursorAuth/openAIKey`), encrypted with the same safeStorage mechanism Cursor uses. Never in config files, logs, or stdout.
- `set-key` reads the "Cursor Safe Storage" Keychain item to encrypt, the same key Cursor itself uses. Nothing leaves your machine.
- `clone` copies `state.vscdb` locally via SQLite backup. The donor can keep running; the target profile window must be closed.

## Known limitations

- A window opened for project A keeps A's key if you open repo B inside it. The extension detects this and offers a one-click relaunch; title bar colors make it visible at a glance.
- `set-key` is macOS-only (Keychain + OSCrypt). On Windows/Linux, paste the key once in Settings per profile; everything else still works.
- Explore subagents spawned ad-hoc still use Cursor's built-in model (per Cursor's own limitation), parent agents use your custom models.

## Development

```bash
npm test    # node --test, zero deps
```

## License

MIT · [L-ubu](https://github.com/L-ubu)
