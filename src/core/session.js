import fs from "node:fs";
import path from "node:path";
import { stateDir } from "./config.js";

const STALE_MS = 24 * 60 * 60 * 1000;

function sanitizeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function sessionFile(key) {
  return path.join(stateDir(), `${sanitizeKey(key)}.json`);
}

function waitingFile(key) {
  return path.join(stateDir(), `${sanitizeKey(key)}.waiting.json`);
}

// Deterministic per-session toast tag, e.g. so a later "resume" hook can
// dismiss the exact "waiting for approval" toast it was shown. Windows toast
// tags top out at 64 chars.
export function toastTag(key) {
  return sanitizeKey(key).slice(0, 64);
}

export function markStart(key) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(sessionFile(key), JSON.stringify({ start: Date.now() }));
  cleanupStale();
}

// Returns elapsed seconds since markStart, or null if no start was recorded.
export function endSession(key) {
  const file = sessionFile(key);
  try {
    const { start } = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.unlinkSync(file);
    if (typeof start !== "number") return null;
    return Math.round((Date.now() - start) / 1000);
  } catch {
    return null;
  }
}

// Records that a "waiting" toast with this tag is currently on screen, so a
// later hook (approval resolved, or the session just moves on) can dismiss it.
export function markWaiting(key, tag) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(waitingFile(key), JSON.stringify({ tag }));
}

// Consumes the pending waiting-toast tag for this session, if any.
export function takeWaitingTag(key) {
  const file = waitingFile(key);
  try {
    const { tag } = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.unlinkSync(file);
    return typeof tag === "string" ? tag : null;
  } catch {
    return null;
  }
}

function cleanupStale() {
  try {
    const dir = stateDir();
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > STALE_MS) fs.unlinkSync(file);
      } catch {
        // ignore races with concurrent sessions
      }
    }
  } catch {
    // state dir may not exist yet
  }
}
