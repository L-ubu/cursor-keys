// Postinstall hint: prints once on global install, never breaks the install.
// Quiet installs: CURSOR_KEYS_NO_POSTINSTALL=1
try {
  if (process.env.CURSOR_KEYS_NO_POSTINSTALL) process.exit(0);
  const yellow = "\x1b[33m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";
  console.log(`
${yellow}cursor-keys installed${reset}

  cursor-keys --help              commands
  cursor-keys aliases --install   aliases, 'ck' shortcut, tab completion
  cursor-keys wrap --install      plain 'cursor <path>' picks the profile

Inside Cursor: Cmd+Shift+P then "cursor-keys: Open Project..." after
'cursor-keys install-extension' (or install 'cursor-keys' from Open VSX).

${dim}Quiet installs: CURSOR_KEYS_NO_POSTINSTALL=1${reset}
`);
} catch {
  /* postinstall must never break install */
}
