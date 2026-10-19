# Security

cursor-keys touches exactly two sensitive things: Cursor's state database
(`state.vscdb`) and the macOS Keychain item Cursor uses for its own secret
encryption. This document spells out what the tool does with each, so you can
judge the blast radius before installing.

## What cursor-keys can and cannot see

| Surface | What happens |
| --- | --- |
| Project API keys | Written only into Cursor's encrypted store (`secret://cursorAuth/openAIKey`) using Cursor's own safeStorage (Chromium OSCrypt). Never written to config files, logs, stdout, or git. |
| Key input | Hidden terminal prompt, or stdin (`op read op://vault/item/password \| cursor-keys set-key <name>`). Inline `--key` values print a warning: they land in shell history and process lists. |
| "Cursor Safe Storage" Keychain item | Read at runtime to encrypt/decrypt, the same password Cursor itself uses. It is held in memory for the duration of the command and never persisted. |
| `~/.config/cursor-keys/config.json` | Project names, repo paths, colors, gateway URL. No secrets, by design. |

## Keychain prompt: click Allow, not Always Allow

When `set-key` first reads the "Cursor Safe Storage" item, macOS asks for
permission. **Allow** grants it for that one run. **Always Allow** permanently
adds the calling binary to the item's access list, so any later process running
as that binary can read the password (and decrypt everything it protects)
without prompting. That is the same mechanism infostealers abuse against
browser safe storage ("Chrome Safe Storage"). One run, one prompt is the
recommended posture.

## What `clone` copies, and what it scrubs

`clone` snapshots the donor's `state.vscdb` (SQLite `VACUUM INTO`, consistent
even while the donor Cursor keeps running). The state DB contains more than
settings, so the copy is scrubbed immediately after creation:

- **Deleted from the copy**: all `secret://` rows (the donor's own API key and
  every extension secret, for example MCP client credentials) and all
  `mcpOAuth.*` rows (MCP OAuth tokens). These never propagate into project
  profiles. Consequence: MCP servers ask you to sign in once per profile.
- **Kept deliberately**: your Cursor sign-in session (`cursorAuth/*`), theme,
  and model config, so profiles open signed-in and ready.

The kept session is the residual risk to be aware of: with N project profiles
there are N+1 copies of the Cursor session tokens on disk, stored exactly as
Cursor itself stores them. That is the price of profiles that open signed-in;
the alternative is signing in manually in every profile. Hygiene:

- Delete profiles for finished projects: `cursor-keys rm <name> --delete`.
- Treat `~/.cursor-profiles/` with the same care as Cursor's own data dir.
- If a session may be compromised, sign out in Cursor (which rotates the
  tokens), then re-clone or delete the affected profiles.

## Supply chain posture

- **Zero runtime dependencies.** The audit surface is this repo and nothing else.
- **No install scripts.** The package runs no `postinstall` or other lifecycle
  scripts, so it installs cleanly with `ignore-scripts=true` (pnpm, npm, and
  yarn alike). The companion extension is linked explicitly via
  `cursor-keys install-extension`.
- **Provenance.** Releases are published from GitHub Actions using npm
  [trusted publishing](https://docs.npmjs.com/trusted-publishers-for-packages)
  (OIDC) with `--provenance`. There is no long-lived npm token to leak.
  Verify any release with `npm audit signatures`.

## Reporting

Open an issue at <https://github.com/L-ubu/cursor-keys/issues>. Never paste API
keys, Keychain contents, or `state.vscdb` values into an issue. Key names are
fine, values are not.
