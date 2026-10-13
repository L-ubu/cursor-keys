#!/usr/bin/env node

import { runCommand } from "../src/commands.mjs";
import { bold, dim, reset, yellow } from "../src/ansi.mjs";

const BANNER = `
 ${yellow} ██████╗██╗   ██╗██████╗ ███████╗ ██████╗ ██████╗     ██╗  ██╗███████╗██╗   ██╗███████╗
 ${yellow}██╔════╝██║   ██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗    ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔════╝
 ${yellow}██║     ██║   ██║██████╔╝███████╗██║   ██║██████╔╝    █████╔╝ █████╗   ╚████╔╝ ███████╗
 ${yellow}██║     ██║   ██║██╔══██╗╚════██║██║   ██║██╔══██╗    ██╔═██╗ ██╔══╝    ╚██╔╝  ╚════██║
 ${yellow}╚██████╗╚██████╔╝██║  ██║███████║╚██████╔╝██║  ██║    ██║  ██╗███████╗   ██║   ███████║
 ${yellow} ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝${reset}${dim}  per-project Cursor API keys
`;

function printHelp() {
  console.log(BANNER);
  console.log(`${bold}Usage:${reset} cursor-keys <command> [options]\n`);
  console.log(`${bold}Commands:${reset}`);
  console.log(
    "  init [--root DIR] [--all]   Scan for git repos and register projects",
  );
  console.log("  add <name> [options]        Create profile for a project");
  console.log(
    "  clone <name> [--from main]  Copy sign-in + settings from a donor profile",
  );
  console.log(
    "  set-key <name>              Inject the project API key (encrypted)",
  );
  console.log(
    "  open [name]                 Open Cursor with this project's profile",
  );
  console.log(
    "  status                      List projects, running windows, key status",
  );
  console.log("  current                     Show mapping for cwd");
  console.log(
    "  config [get <key>|baseUrl [URL]]  Show, read, or set config values",
  );
  console.log(
    "  sync [name]                 Re-copy main Cursor settings into profiles",
  );
  console.log(
    "  doctor [name]               Verify setup for one or all projects",
  );
  console.log("  aliases [--install]         Print or install shell aliases");
  console.log(
    "  wrap [--install]            Make plain `cursor <path>` auto-pick profile",
  );
  console.log(
    "  install-extension           Link the Cursor extension (status bar + warnings)",
  );
  console.log(
    "  rm <name> [--delete]        Unregister (optionally delete profile dir)",
  );
  console.log(
    "\nRun `cursor-keys <command> --help` for command-specific options.",
  );
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  printHelp();
  process.exit(0);
}

try {
  await runCommand(args);
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}
