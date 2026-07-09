import { ensureConfig, configPath } from "../core/config.js";
import { claudeDetected, claudeSettingsPath, installClaudeHooks } from "../integrations/claude.js";
import { codexDetected, codexConfigPath, installCodexNotify } from "../integrations/codex.js";

export async function cmdInit(args) {
  const onlyClaude = Boolean(args.flags.claude);
  const onlyCodex = Boolean(args.flags.codex);
  const both = !onlyClaude && !onlyCodex;

  const created = ensureConfig();
  console.log(`${created ? "Created" : "Config"}: ${configPath()}`);

  let installed = 0;

  if (onlyClaude || both) {
    if (claudeDetected() || onlyClaude) {
      installClaudeHooks();
      console.log(`Claude Code: hooks written to ${claudeSettingsPath()} (backup: .afk-notify.bak)`);
      installed++;
    } else {
      console.log("Claude Code: not detected (~/.claude missing), skipped. Force with: afk-notify init --claude");
    }
  }

  if (onlyCodex || both) {
    if (codexDetected() || onlyCodex) {
      installCodexNotify();
      console.log(`Codex: notify written to ${codexConfigPath()} (backup: .afk-notify.bak)`);
      installed++;
    } else {
      console.log("Codex: not detected (~/.codex missing), skipped. Force with: afk-notify init --codex");
    }
  }

  if (installed === 0) {
    console.log("Nothing installed. Is Claude Code or Codex CLI installed on this machine?");
    process.exitCode = 1;
    return;
  }

  console.log(`
Next steps:
  1. Edit ${configPath()}
     — enable at least one channel and paste your webhook/topic.
  2. Run: afk-notify test
  3. Restart your agent session. Done — long tasks and approval
     prompts will now reach you.`);
}
