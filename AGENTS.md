## Learned User Preferences

- Luca wants one-time setup followed by fully automatic behavior; he rejected opening projects via a CLI command and pushed for automatic profile/key selection instead (companion extension, shell wrapper, aliases).
- New tool repos should follow his micro-tool mold (reference repos: wip-ai, cursor-cost): sharp README with ASCII banner, single-file GitHub Pages landing page in `docs/`, entry in the L-ubu.github.io hub registry, and a filled-in GitHub About (description, homepage URL, topics).
- Commits and written repo content use conventional commit messages, no co-author trailers, and no em-dashes (his hard rule; use `·` or colons instead).
- Tools built for sharing must stay generic: no hardcoded personal paths or project names in the repo; per-user state lives outside the repo.
- Drafting workplace communications (Slack replies, feedback to rollout owners) is iterative, message by message: keep the tone critical-but-constructive, back claims with evidence and numbers, concede points where fair, and end with a concrete ask.

## Learned Workspace Facts

- This repo is `cursor-keys` (npm package name, public GitHub repo `L-ubu/cursor-keys`; local folder is named `api-key-switcher`): per-project Cursor profiles so each Cursor window bills the correct BYOK API key. Works with any OpenAI-compatible gateway (LiteLLM, Vercel AI Gateway, ...).
- Core constraint driving the design: Cursor stores API keys profile-globally (no workspace-level key setting, no env var support, no extension API to change keys), so each project gets an isolated `--user-data-dir` profile under `~/.cursor-profiles/<name>/`; fully automatic key switching inside a single window is impossible.
- Stack: Node >= 18, ESM `.mjs`, zero runtime dependencies; tests via `node --test`; CLI entry `bin/cursor-keys.mjs` (bins `cursor-keys` and `ckeys`); modules in `src/` (config, detect, profile, keychain, commands, jsonc, ansi); companion Cursor extension in `extension/`; Pages site in `docs/index.html` with amber accent `#fbbf24`.
- `set-key` encrypts project keys with Cursor's own safeStorage mechanism (Chromium OSCrypt; password read at runtime from the "Cursor Safe Storage" macOS Keychain item) and writes the `secret://cursorAuth/openAIKey` row into the profile's `state.vscdb`, round-trip verified; key injection is macOS-only, Windows/Linux users paste the key once per profile manually.
- Per-user config lives at `~/.config/cursor-keys/config.json` (never committed); gateway base URL is set via `cursor-keys config baseUrl` (URL-validated). Fresh installs without a config file get a built-in default until the user overrides it.
- Settings sync is one-way from the main profile: `cursor-keys sync [name]` re-copies main's `settings.json` into profiles while re-applying each profile's title bar color, and `open` auto-syncs before every launch; keybindings and snippets are symlinked to main; API keys and sign-in/model state are deliberately not synced (state DB changes need `clone`).
- Distribution: CLI published on npm as `cursor-keys`; companion extension published on Open VSX as `lubu/cursor-keys`.
- This project handles real API keys and Cursor keychain material: never write keys, encrypted key blobs, or keychain passwords into files, logs, stdout, commits, or memory notes; always fetch secrets dynamically at runtime. Real keys pasted in chat during the build session were treated as burned.
- Gateway stress-testing and benchmarking stay outside this repo (Luca's explicit rule: cursor-keys stays a generic tool; no gateway-specific test tooling, docs, or scripts here). External bench tooling may import this repo's `src/` helpers (config, keychain, ansi), so keep their export names and signatures stable.
