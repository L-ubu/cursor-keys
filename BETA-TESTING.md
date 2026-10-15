# cursor-keys: beta testing guide

Thanks for testing! Full setup takes about 10 minutes, most of it the one-time profile clone. After that, switching keys between projects costs zero thought.

## What this is

Cursor stores your BYOK API key once per profile, not per repo. cursor-keys gives each project its own isolated Cursor profile, so every window automatically uses the right key. Repo: <https://github.com/L-ubu/cursor-keys>

## Before you start

- macOS (automatic key injection is macOS-only)
- Cursor installed, plus its shell command: in Cursor, `Cmd+Shift+P` → "Shell Command: Install 'cursor' in PATH"
- Node 18 or newer: `node --version`
- sqlite3 (preinstalled on macOS, check with `sqlite3 --version`)
- An API key for your OpenAI-compatible gateway (LiteLLM, corporate proxy, ...)

## 1. Install the CLI

```bash
npm install -g cursor-keys
cursor-keys --help   # sanity check: banner + command list
```

(Dev alternative: clone the repo and `npm link` from it.)

## 2. Set your gateway

```bash
cursor-keys config baseUrl https://gateway.example.com/v1
cursor-keys config   # shows current settings
cursor-keys config get baseUrl   # script-friendly single value
```

## 3. Register a project

```bash
cursor-keys add myproject --path ~/Projects/myproject
# or scan a whole directory at once:
cursor-keys init
```

## 4. Clone your Cursor setup into the profile

```bash
cursor-keys clone myproject
```

Copies sign-in, settings, theme, and model config from your main Cursor so the new profile opens ready instead of as a fresh install. Can take a couple of minutes (the state DB can be several GB). Your main Cursor can stay open.

## 5. Inject the API key

```bash
cursor-keys set-key myproject
```

- Paste the key at the hidden prompt (nothing echoes), press Enter
- macOS shows a Keychain dialog for "Cursor Safe Storage": click **Always Allow** (asked once)
- The write is verified by decrypting it back, so a success message means Cursor can read it

The key goes into Cursor's own encrypted store, never into a plaintext file.

## 6. Quality of life (one-time)

```bash
cursor-keys wrap --install      # plain `cursor <path>` auto-picks the right profile
cursor-keys aliases --install   # per-project aliases, `ck` shortcut, and zsh tab completion (e.g. `cursor-keys open <TAB>`)
cursor-keys sync                # re-copy main Cursor settings into all profiles (also runs on every `open`)

# companion extension, pick one:
#   a) Cursor Extensions panel -> search "cursor-keys" -> Install (Open VSX marketplace)
#   b) cursor-keys install-extension   (links the extension from this clone, dev mode)
```

Restart your terminal (or `source ~/.zshrc`) after wrap/aliases.

## 7. Use it

```bash
cd ~/Projects/myproject
cursor .                          # wrapper injects the right profile
# or: cursor-keys open myproject
# or inside Cursor: Cmd+Shift+P -> "cursor-keys: Open Project..."
```

## The beta checklist (please verify these)

1. `cursor-keys status` shows your project with `yes` under Key and the right color swatch
2. `cursor-keys doctor myproject` shows all ✓
3. Open two registered projects side by side: different title bar colors, and the extension status bar shows `$(key) <name>` in each window
4. Wrong-window test: open repo A inside repo B's window. You should get a warning popup plus a highlighted status bar item; clicking it relaunches the folder in the correct profile
5. Make an AI request in each window, then check your gateway dashboard: usage should land on the right key per project
6. `cursor .` from a registered repo opens the matching profile, not your default Cursor

## Reporting issues

Open an issue at <https://github.com/L-ubu/cursor-keys/issues> with:

- which checklist step failed
- `cursor-keys doctor` output
- macOS version (`sw_vers`)
- Cursor version (Cursor menu → About Cursor)

Do not paste API keys or Keychain contents into issues. Ever.

## Uninstall / clean slate

```bash
cursor-keys rm myproject --delete    # unregister + delete the profile dir
npm unlink -g cursor-keys
rm -rf ~/.config/cursor-keys
rm -rf ~/.cursor/extensions/lubu.cursor-keys-*
rm -rf ~/.cursor-profiles            # optional: deletes ALL project profiles
```

Also remove the two marked blocks in `~/.zshrc` (between `# >>> cursor-keys` and `# <<< cursor-keys` markers).

## Known limitations (by design)

- `set-key` is macOS-only; on Windows/Linux paste the key once per profile in Cursor Settings → Models
- A window keeps its own key for anything opened inside it: the extension detects this and offers a one-click relaunch
- Ad-hoc Explore subagents still use Cursor's built-in model (a Cursor limitation, not cursor-keys)
