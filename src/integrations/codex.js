import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { MARKER } from "./claude.js";

export function codexConfigPath() {
  return path.join(process.env.AFK_NOTIFY_CODEX_DIR || path.join(os.homedir(), ".codex"), "config.toml");
}

export function codexDetected() {
  return fs.existsSync(path.dirname(codexConfigPath()));
}

function tomlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function notifyLine() {
  const bin = fileURLToPath(new URL("../../bin/afk-notify.js", import.meta.url));
  const argv = [process.execPath, bin, "send", "--source", "codex", "--event", "done"];
  return `notify = [${argv.map(tomlString).join(", ")}]`;
}

// `notify` is a TOML root key: it must appear before any [table] header.
export function installCodexNotify(configFile = codexConfigPath()) {
  const exists = fs.existsSync(configFile);
  const text = exists ? fs.readFileSync(configFile, "utf8") : "";
  if (exists) fs.copyFileSync(configFile, configFile + ".afk-notify.bak");

  const lines = text.split(/\r?\n/);
  const notifyIdx = lines.findIndex((l) => /^\s*notify\s*=/.test(l));
  if (notifyIdx >= 0) {
    if (!lines[notifyIdx].includes(MARKER)) {
      throw new Error(
        `${configFile} already has a \`notify\` setting.\n` +
          `Replace it manually if you want afk-notify to handle Codex:\n  ${notifyLine()}`
      );
    }
    lines[notifyIdx] = notifyLine();
  } else {
    const tableIdx = lines.findIndex((l) => /^\s*\[/.test(l));
    if (tableIdx === -1) {
      if (lines.length === 1 && lines[0] === "") lines.length = 0;
      lines.push(notifyLine(), "");
    } else {
      lines.splice(tableIdx, 0, notifyLine(), "");
    }
  }
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, lines.join("\n"));
}

export function uninstallCodexNotify(configFile = codexConfigPath()) {
  if (!fs.existsSync(configFile)) return false;
  const lines = fs.readFileSync(configFile, "utf8").split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*notify\s*=/.test(l) && l.includes(MARKER));
  if (idx === -1) return false;
  lines.splice(idx, 1);
  if (lines[idx] === "") lines.splice(idx, 1); // drop the blank line we added
  fs.writeFileSync(configFile, lines.join("\n"));
  return true;
}
