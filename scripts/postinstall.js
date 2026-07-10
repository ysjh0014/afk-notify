// Runs on every `npm install`/upgrade. Self-heals hooks for machines that
// already opted in (ran `afk-notify init` before) so a version bump that
// adds a new hook type — like PostToolUse for auto-dismissing "waiting"
// toasts — doesn't require the user to remember to rerun `init` by hand.
//
// Never touches a machine that never ran `init`: hasOurHooks()/hasOurNotify()
// only return true once our marker is already present, so this can't be the
// thing that installs hooks on a fresh `npm install -g afk-notify`. And it
// must never fail `npm install` itself — every step is wrapped so an error
// here is silently swallowed.
import { hasOurHooks, installClaudeHooks } from "../src/integrations/claude.js";
import { hasOurNotify, installCodexNotify } from "../src/integrations/codex.js";

function resync(label, hasOurs, install) {
  try {
    if (!hasOurs()) return;
    install();
    console.log(`afk-notify: re-synced ${label} hooks (picked up any new event types).`);
  } catch {
    // best effort — never break `npm install` over this
  }
}

resync("Claude Code", hasOurHooks, installClaudeHooks);
resync("Codex", hasOurNotify, installCodexNotify);
