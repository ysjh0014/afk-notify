import fs from "node:fs";
import path from "node:path";
import { stateDir } from "./config.js";

const STALE_MS = 24 * 60 * 60 * 1000;

function sessionFile(key) {
  const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return path.join(stateDir(), `${safe}.json`);
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
