import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// AFK_NOTIFY_HOME overrides the base dir (used by tests).
export function configDir() {
  return path.join(process.env.AFK_NOTIFY_HOME || os.homedir(), ".afk-notify");
}

export function configPath() {
  return path.join(configDir(), "config.json");
}

export function stateDir() {
  return path.join(configDir(), "state");
}

export function defaultConfig() {
  return {
    lang: "auto",
    thresholdSeconds: 45,
    includeSummary: false,
    toast: true,
    channels: {
      wecom: { enabled: false, webhook: "" },
      dingtalk: { enabled: false, webhook: "", secret: "", keyword: "" },
      feishu: { enabled: false, webhook: "", secret: "" },
      slack: { enabled: false, webhook: "" },
      discord: { enabled: false, webhook: "" },
      ntfy: {
        enabled: false,
        server: "https://ntfy.sh",
        topic: "afk-notify-" + crypto.randomBytes(5).toString("hex")
      }
    }
  };
}

export function ensureConfig() {
  const file = configPath();
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(defaultConfig(), null, 2) + "\n");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is a no-op on Windows
  }
  return true;
}

export function loadConfig() {
  ensureConfig();
  let raw;
  try {
    // strip UTF-8 BOM — Windows editors commonly add one
    raw = JSON.parse(fs.readFileSync(configPath(), "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath()}: ${err.message}`);
  }
  return deepMerge(defaultConfig(), raw);
}

function deepMerge(base, override) {
  if (override === undefined) return base;
  if (
    base === null || override === null ||
    typeof base !== "object" || typeof override !== "object" ||
    Array.isArray(base) || Array.isArray(override)
  ) {
    return override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key]);
  }
  return out;
}

export function maskSecret(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  if (value.length <= 12) return "***";
  return value.slice(0, 28) + "…***";
}

export function maskedConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  for (const channel of Object.values(clone.channels ?? {})) {
    for (const key of ["webhook", "secret"]) {
      if (channel[key]) channel[key] = maskSecret(channel[key]);
    }
  }
  return clone;
}
