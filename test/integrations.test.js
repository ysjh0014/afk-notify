import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installClaudeHooks, uninstallClaudeHooks, hookCommand, hasOurHooks } from "../src/integrations/claude.js";
import { installCodexNotify, uninstallCodexNotify, notifyLine, hasOurNotify } from "../src/integrations/codex.js";

const postinstallScript = fileURLToPath(new URL("../scripts/postinstall.js", import.meta.url));

function runPostinstall(env) {
  return spawnSync(process.execPath, [postinstallScript], { env: { ...process.env, ...env }, encoding: "utf8" });
}

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "afk-int-"));
});

function settingsFile(content) {
  const file = path.join(dir, "settings.json");
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

function tomlFile(content) {
  const file = path.join(dir, "config.toml");
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

test("claude: installs four hooks into empty settings", () => {
  const file = settingsFile();
  installClaudeHooks(file);
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const name of ["UserPromptSubmit", "Stop", "Notification", "PostToolUse"]) {
    assert.equal(settings.hooks[name].length, 1, name);
    assert.ok(settings.hooks[name][0].hooks[0].command.includes("afk-notify"));
  }
  assert.ok(settings.hooks.PostToolUse[0].hooks[0].command.includes("--event resume"));
});

test("claude: install is idempotent and preserves user hooks", () => {
  const file = settingsFile(
    JSON.stringify({ model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } })
  );
  installClaudeHooks(file);
  installClaudeHooks(file);
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(settings.model, "opus");
  assert.equal(settings.hooks.Stop.length, 2); // user's + ours, once
  assert.equal(settings.hooks.Stop[0].hooks[0].command, "echo mine");
});

test("claude: uninstall removes only our hooks", () => {
  const file = settingsFile(
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } })
  );
  installClaudeHooks(file);
  assert.equal(uninstallClaudeHooks(file), true);
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(Object.keys(settings.hooks), ["Stop"]);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, "echo mine");
  assert.equal(uninstallClaudeHooks(file), false); // second run: nothing left
});

test("claude: hookCommand uses absolute paths", () => {
  const cmd = hookCommand("done");
  assert.ok(cmd.includes("send --source claude --event done"));
  assert.ok(path.isAbsolute(cmd.replace(/"/g, "").split(" ")[0]));
});

test("codex: notify inserted before first table", () => {
  const file = tomlFile('model = "o4"\n\n[tui]\nnotifications = true\n');
  installCodexNotify(file);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.indexOf("notify = [") < text.indexOf("[tui]"));
  assert.ok(text.startsWith('model = "o4"'));
});

test("codex: install is idempotent", () => {
  const file = tomlFile("");
  installCodexNotify(file);
  installCodexNotify(file);
  const text = fs.readFileSync(file, "utf8");
  assert.equal(text.match(/^notify = /gm).length, 1);
});

test("codex: refuses to clobber a foreign notify setting", () => {
  const file = tomlFile('notify = ["my-own-notifier"]\n');
  assert.throws(() => installCodexNotify(file), /already has/);
  assert.ok(fs.readFileSync(file, "utf8").includes("my-own-notifier"));
});

test("codex: uninstall removes our line only", () => {
  const file = tomlFile('model = "o4"\n');
  installCodexNotify(file);
  assert.equal(uninstallCodexNotify(file), true);
  assert.equal(fs.readFileSync(file, "utf8").trim(), 'model = "o4"');
  assert.equal(uninstallCodexNotify(file), false);
});

test("codex: notifyLine escapes backslashes for TOML", () => {
  const line = notifyLine();
  assert.ok(!/[^\\]\\[^\\"]/.test(line), `unescaped backslash in: ${line}`);
});

test("hasOurHooks: false until init has run, true after", () => {
  const file = settingsFile();
  assert.equal(hasOurHooks(file), false);
  installClaudeHooks(file);
  assert.equal(hasOurHooks(file), true);
});

test("hasOurNotify: false until init has run, true after", () => {
  const file = tomlFile();
  assert.equal(hasOurNotify(file), false);
  installCodexNotify(file);
  assert.equal(hasOurNotify(file), true);
});

test("postinstall: no-op on a machine that never ran init", () => {
  const file = settingsFile();
  const result = runPostinstall({ AFK_NOTIFY_CLAUDE_DIR: dir, AFK_NOTIFY_CODEX_DIR: dir });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
  assert.ok(!fs.existsSync(file));
});

test("postinstall: re-syncs an already opted-in Claude settings file with new hook types", () => {
  const file = settingsFile(
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: hookCommand("done") }] }] } })
  );
  const result = runPostinstall({ AFK_NOTIFY_CLAUDE_DIR: dir, AFK_NOTIFY_CODEX_DIR: dir });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("Claude Code"));
  const settings = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.ok(settings.hooks.PostToolUse);
});

test("postinstall: re-syncs an already opted-in Codex config", () => {
  installCodexNotify(tomlFile('model = "o4"\n'));
  const result = runPostinstall({ AFK_NOTIFY_CLAUDE_DIR: dir, AFK_NOTIFY_CODEX_DIR: dir });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("Codex"));
});
