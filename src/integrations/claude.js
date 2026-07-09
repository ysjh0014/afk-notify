import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const MARKER = "afk-notify";

export function claudeSettingsPath() {
  return path.join(process.env.AFK_NOTIFY_CLAUDE_DIR || path.join(os.homedir(), ".claude"), "settings.json");
}

export function claudeDetected() {
  return fs.existsSync(path.dirname(claudeSettingsPath()));
}

function binPath() {
  return fileURLToPath(new URL("../../bin/afk-notify.js", import.meta.url));
}

function quote(p) {
  return /\s/.test(p) ? `"${p}"` : p;
}

// Absolute node + script path: hooks may run in a shell whose PATH
// lacks the npm global bin dir (common on Windows).
export function hookCommand(event) {
  return `${quote(process.execPath)} ${quote(binPath())} send --source claude --event ${event}`;
}

const HOOK_EVENTS = {
  UserPromptSubmit: "start",
  Stop: "done",
  Notification: "waiting"
};

function isOurs(hook) {
  return typeof hook?.command === "string" && hook.command.includes(MARKER);
}

// Removes our entries from one hook array, preserving everything else.
function stripOurs(matchers) {
  if (!Array.isArray(matchers)) return matchers ?? [];
  return matchers
    .map((m) => (Array.isArray(m?.hooks) ? { ...m, hooks: m.hooks.filter((h) => !isOurs(h)) } : m))
    .filter((m) => !Array.isArray(m?.hooks) || m.hooks.length > 0);
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

export function installClaudeHooks(settingsFile = claudeSettingsPath()) {
  const settings = readSettings(settingsFile);
  if (fs.existsSync(settingsFile)) {
    fs.copyFileSync(settingsFile, settingsFile + ".afk-notify.bak");
  }
  settings.hooks = settings.hooks ?? {};
  for (const [hookName, event] of Object.entries(HOOK_EVENTS)) {
    const kept = stripOurs(settings.hooks[hookName]);
    kept.push({ hooks: [{ type: "command", command: hookCommand(event), timeout: 30 }] });
    settings.hooks[hookName] = kept;
  }
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
}

export function uninstallClaudeHooks(settingsFile = claudeSettingsPath()) {
  if (!fs.existsSync(settingsFile)) return false;
  const settings = readSettings(settingsFile);
  if (!settings.hooks) return false;
  let changed = false;
  for (const hookName of Object.keys(HOOK_EVENTS)) {
    const before = JSON.stringify(settings.hooks[hookName] ?? null);
    const kept = stripOurs(settings.hooks[hookName]);
    if (kept.length === 0) delete settings.hooks[hookName];
    else settings.hooks[hookName] = kept;
    if (JSON.stringify(settings.hooks[hookName] ?? null) !== before) changed = true;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  if (changed) fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
  return changed;
}
