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

The package runs **no install scripts** (`ignore-scripts=true` safe). Link the companion extension once yourself:

```bash
cursor-keys install-extension   # or install "cursor-keys" from the Open VSX marketplace in Cursor
```

Restart Cursor, then `Cmd+Shift+P` → "cursor-keys: Open Project...".

## No terminal? Let Cursor's agent set it up

Open your project in Cursor, paste this into the agent chat (`Cmd+L`), and it runs the whole setup for you. Your API key goes into a hidden terminal prompt, never into the chat:

```text
Set up cursor-keys (github.com/L-ubu/cursor-keys) for this project, step by step:
1. Run `npm install -g cursor-keys`.
2. Run `cursor-keys config baseUrl <your-gateway-url>` (replace with my gateway URL, e.g. https://gateway.example.com/v1).
3. Register this workspace: `cursor-keys add <folder-name> --path <this workspace's path>`.
4. Run `cursor-keys clone <folder-name>` to inherit my Cursor sign-in and settings.
5. Run `cursor-keys set-key <folder-name>` and ask me to paste the project API key at the hidden terminal prompt. Never write the key into files, chat, or logs.
6. Run `cursor-keys doctor <folder-name>` and fix what it flags.
7. Run `cursor-keys aliases --install` and `cursor-keys wrap --install` for the shell extras.
8. Open the project in its profile with `cursor-keys open <folder-name>`, then explain how I can tell it worked.
```

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
cursor-keys install-extension     # status bar + wrong-window guard
```

## How it works

One window, one profile, one key. Each project gets an isolated `--user-data-dir` under `~/.cursor-profiles/<name>/`, which is the only way Cursor can hold two API keys at once. Extensions, MCP config, keybindings, and snippets stay shared (symlinked); secrets and sign-in isolate, which is exactly the split you want.

Settings flow one way, main to profiles: `sync` re-copies your main `settings.json` into every profile and re-applies that profile's title bar color on top. `open` does this automatically before every launch, and open windows hot-reload the file, so tweaks in your main Cursor show up everywhere. Changes made inside a profile window are overwritten on the next sync.

`clone` copies your main Cursor state (SQLite backup) so profiles open signed-in with your theme and model config, then scrubs donor secrets (`secret://` rows, MCP OAuth tokens, extension secrets) out of the copy and prunes the AI chat/agent history tables (`cursorDiskKV`, `composerHeaders`). That keeps clones at a few megabytes instead of a full copy of a donor database that can be gigabytes, and stops one project's conversation history from leaking into another project's profile. The sign-in session itself is the one thing that does carry over, see [Security](#security). Already have bulky profiles? `cursor-keys prune [name]` applies the same cleanup to existing ones. `set-key` encrypts your project key with Cursor's own safeStorage (Chromium OSCrypt, key from the "Cursor Safe Storage" macOS Keychain item) and writes it into the profile's secret store, round-trip verified. When macOS asks for Keychain permission, click **Allow**: one run, one prompt. Always Allow also works, but it permanently grants the calling binary access to that Keychain item, which is the same pattern infostealers abuse against browser safe storage.

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
| `prune [name]`                                 | Delete AI chat history from profile DBs, reclaim disk space     |
| `set-key <name>`                               | Inject the project API key (hidden prompt or stdin, encrypted)  |
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
| `install-extension`                            | Link the Cursor extension (status bar + wrong-window guard)     |
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

Full threat model in [SECURITY.md](SECURITY.md). The short version:

- Keys go **straight into Cursor's own encrypted store** (`secret://cursorAuth/openAIKey`), encrypted with the same safeStorage mechanism Cursor uses. Never in config files, logs, or stdout. `set-key` takes the key from a hidden prompt or stdin, so it never appears in shell history or a process list.
- `set-key` reads the "Cursor Safe Storage" Keychain item to encrypt, the same key Cursor itself uses. Nothing leaves your machine. Click **Allow** at the prompt; Always Allow permanently ACLs the calling binary to that item.
- `clone` copies `state.vscdb` locally via SQLite backup, then **scrubs donor secrets from the copy**: all `secret://` rows (the donor's API key, extension secrets) and MCP OAuth tokens are deleted. MCP servers re-auth once per profile. The **AI history tables are pruned** too, so no chat or agent session data crosses between project profiles (and clones stay megabytes, not gigabytes).
- What clone deliberately keeps is your Cursor **sign-in session** (so profiles open signed-in). That means N profiles hold N+1 copies of the session tokens, stored exactly as Cursor stores them. Delete profiles you no longer use: `cursor-keys rm <name> --delete`.
- Supply chain: zero runtime dependencies, **no install scripts**, and releases are published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) over OIDC trusted publishing (no long-lived npm token).

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
