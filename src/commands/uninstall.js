import fs from "node:fs";
import { configDir } from "../core/config.js";
import { claudeSettingsPath, uninstallClaudeHooks } from "../integrations/claude.js";
import { codexConfigPath, uninstallCodexNotify } from "../integrations/codex.js";

export async function cmdUninstall(args) {
  const claudeChanged = uninstallClaudeHooks();
  console.log(claudeChanged ? `Claude Code: hooks removed from ${claudeSettingsPath()}` : "Claude Code: nothing to remove");

  const codexChanged = uninstallCodexNotify();
  console.log(codexChanged ? `Codex: notify removed from ${codexConfigPath()}` : "Codex: nothing to remove");

  if (args.flags.purge) {
    fs.rmSync(configDir(), { recursive: true, force: true });
    console.log(`Removed ${configDir()}`);
  } else {
    console.log(`Config kept at ${configDir()} (delete it with: afk-notify uninstall --purge)`);
  }
}
