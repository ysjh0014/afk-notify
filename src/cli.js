import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { cmdInit } from "./commands/init.js";
import { cmdUninstall } from "./commands/uninstall.js";
import { cmdTest } from "./commands/test.js";
import { cmdSend } from "./commands/send.js";
import { cmdConfig } from "./commands/config.js";

const VALUE_FLAGS = new Set(["source", "event"]);

export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (VALUE_FLAGS.has(key) && argv[i + 1] !== undefined) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

const HELP = `afk-notify — task-completion notifications for Claude Code & Codex CLI

Usage:
  afk-notify init [--claude] [--codex]   Configure agent hooks (idempotent)
  afk-notify test [--dry-run]            Send a test notification to all enabled channels
  afk-notify config                      Show config path and current config (secrets masked)
  afk-notify uninstall [--purge]         Remove hooks (--purge also deletes ~/.afk-notify)
  afk-notify send --source X --event Y   Internal: invoked by agent hooks

Channels: wecom, dingtalk, feishu, slack, discord, ntfy
Config:   ~/.afk-notify/config.json`;

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];

  if (args.flags.version) {
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
    console.log(pkg.version);
    return;
  }

  switch (command) {
    case "init":
      return cmdInit(args);
    case "uninstall":
      return cmdUninstall(args);
    case "test":
      return cmdTest(args);
    case "send":
      return cmdSend(args);
    case "config":
      return cmdConfig(args);
    case "help":
    case undefined:
      console.log(HELP);
      return;
    default:
      console.log(HELP);
      process.exitCode = command ? 1 : 0;
  }
}
