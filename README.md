# cursor-keys

Per-project Cursor profiles so each window uses the correct BYOK API key (Bonzai, LiteLLM, AI Gateway, etc.). Zero dependencies.

```
  ╔═╗┬ ┬┌─┐┬─┐┌─┐  ┬┌─┐┬ ┬┌─┐┬─┐┌─┐
  │  │ ││ │├┬┘├┤   │├─┤└┬┘├┤ ├┬┘└─┐
  └─┘└─┘└─┘┴└─└─┘  ┴┴ ┴ └ └─┘┴└─└─┘
```

## Problem

Cursor stores your OpenAI-compatible API key **once per profile**, not per repo. If you bill five client projects through Bonzai, switching keys in Settings every time you change context does not scale, and two windows cannot use two keys at once without separate profiles.

## Solution

`cursor-keys` registers projects, creates an isolated `--user-data-dir` per project, and opens Cursor with the right profile. Each profile gets a **title bar color** so you always know which billing context you are in.

## Install

```bash
npm install -g cursor-keys
# or from source: git clone https://github.com/L-ubu/cursor-keys && cd cursor-keys && npm link
```

Requires **Node 18+**, **Cursor CLI** on PATH, and **sqlite3** for key presence checks (macOS: usually preinstalled).

## Quick start

```bash
# Scan ~/Projects for git repos and register interactively
cursor-keys init

# Create profile (copy Bonzai settings from your main Cursor profile)
cursor-keys add my-client --path ~/Projects/my-client --clone main

# Open with the correct profile (from anywhere)
cursor-keys open my-client

# See running windows and whether each profile has a key configured
cursor-keys status

# Verify Bonzai base URL + key row + subagent overrides
cursor-keys doctor
```

### One-time per project (fully scripted)

```bash
cursor-keys add acme --path ~/Projects/acme   # register + create profile
cursor-keys clone acme                        # inherit sign-in, settings, models from main Cursor
cursor-keys set-key acme                      # hidden prompt, key written encrypted (Cursor's own safeStorage)
```

`set-key` encrypts exactly like Cursor does (Chromium OSCrypt, key from the "Cursor Safe Storage" Keychain item). macOS shows a Keychain permission dialog once; click **Always Allow**. The profile window must be closed while setting the key.

If you prefer not to touch the Keychain, the manual checklist still works: open the profile, Settings → Models, paste the key, base URL `https://connect.iobonzai.com/cursor`, Composer 2.5 as explore subagent.

## Commands

| Command                                                   | Description                                              |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `init [--root DIR] [--all]`                               | Discover git repos and add to config                     |
| `add <name> [--path] [--color #hex] [--clone main\|name]` | Create profile directory                                 |
| `open [name]`                                             | Launch Cursor (auto-detect project from cwd if omitted)  |
| `status`                                                  | Projects, colors, running windows, key configured        |
| `current`                                                 | Mapping for current working directory                    |
| `doctor [name]`                                           | Health checks for one or all projects                    |
| `clone <name> [--from main]`                              | Copy sign-in + settings + model config from donor        |
| `set-key <name> [--key sk-...]`                           | Inject project API key (encrypted, round-trip verified)  |
| `aliases [--install]`                                     | Shell aliases `cursor-keys open <name>`                  |
| `wrap [--install]`                                        | zsh function so plain `cursor <path>` auto-picks profile |
| `install-extension`                                       | Link the Cursor extension into `~/.cursor/extensions`    |
| `rm <name> [--delete]`                                    | Remove from config (optional profile wipe)               |

## Extension (built-in feel)

```bash
cursor-keys install-extension   # then restart Cursor windows
```

A tiny extension (no deps, no build step) that runs in every profile:

- **Status bar** shows `$(key) <project>` when the window's key matches the folder
- **Wrong-window guard**: open a registered repo in the wrong window and you get a warning plus one-click "Relaunch correctly" (opens the right profile window, closes this one)
- **Command palette**: `cursor-keys: Open Project...` opens any registered project in its profile, no terminal needed

Extensions live in `~/.cursor/extensions` (outside the profile dir), so one install covers every project window.

## Transparent terminal wrapper

```bash
cursor-keys wrap --install && source ~/.zshrc
```

After this, plain `cursor .` or `cursor ~/Projects/jlr_mss` silently injects the right `--user-data-dir`. Anything outside a registered project falls through to the real `cursor` binary unchanged. Bypass once with `CURSOR_KEYS_NO_WRAP=1 cursor .`.

## Config

`~/.config/cursor-keys/config.json`:

```json
{
  "profilesRoot": "~/.cursor-profiles",
  "baseUrl": "https://connect.iobonzai.com/cursor",
  "projects": {
    "my-client": {
      "path": "~/Projects/my-client",
      "color": "#4f8cff"
    }
  }
}
```

Profiles live at `~/.cursor-profiles/<name>/` (override with `profilesRoot`). `baseUrl` is your gateway's OpenAI-compatible endpoint (Bonzai by default; point it at LiteLLM, Vercel AI Gateway, etc. by editing the config).

## Security

- **Keys go straight into Cursor's own encrypted store** (`secret://cursorAuth/openAIKey`), encrypted with the same safeStorage mechanism Cursor uses. They are never written to config files, logs, or printed.
- `set-key` reads the "Cursor Safe Storage" Keychain item to encrypt; that's the same key Cursor itself uses, nothing leaves your machine.
- `clone` copies `state.vscdb` locally via SQLite backup (safe while the donor Cursor is running; the target profile window must be closed).

## Limitations

- Opening repo B inside a window started for project A still uses **A's** key. The extension detects this and offers a one-click relaunch; title bar colors make it visible at a glance.
- macOS-first; paths are structured for Windows/Linux follow-up.
- Explore subagents still use Cursor's Composer 2.5 per org policy; parent agents use your Bonzai custom models.

## Development

```bash
npm test
```

## License

MIT · [L-ubu](https://github.com/L-ubu)
