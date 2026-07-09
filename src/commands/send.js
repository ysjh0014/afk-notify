import path from "node:path";
import { loadConfig } from "../core/config.js";
import { resolveLang } from "../core/i18n.js";
import { buildMessage } from "../core/message.js";
import { markStart, endSession } from "../core/session.js";
import { shouldPushRemote } from "../core/policy.js";
import { pushAll } from "../providers/index.js";
import { toast } from "../providers/toast.js";

// Invoked by agent hooks:
//   Claude Code passes a JSON payload on stdin.
//   Codex passes a JSON payload as the last CLI argument.
export async function cmdSend(args) {
  const source = args.flags.source || "claude";
  const event = args.flags.event || "done";
  const dryRun = Boolean(args.flags["dry-run"]);

  const payload = await readPayload(args);
  const sessionId = payload.session_id ?? payload["turn-id"] ?? payload.turn_id ?? "default";
  const sessionKey = `${source}-${sessionId}`;

  if (event === "start") {
    markStart(sessionKey);
    return;
  }

  const config = loadConfig();
  const lang = resolveLang(config);
  const cwd = payload.cwd || process.cwd();
  const project = path.basename(cwd);

  const durationSec = event === "done" ? endSession(sessionKey) : null;

  // The Notification hook message ("Claude needs your permission to…")
  // is not conversation content, so it is always safe to include.
  let summary = event === "waiting" ? payload.message ?? null : null;
  if (config.includeSummary && event === "done") {
    summary = payload["last-assistant-message"] ?? null;
  }

  const msg = buildMessage({ source, event, project, durationSec, summary, lang });

  if (config.toast) {
    if (dryRun) {
      console.log(`[dry-run] toast: ${msg.title} — ${msg.body}`);
    } else {
      try {
        await toast(msg);
      } catch (err) {
        console.error(`toast failed: ${err.message}`);
      }
    }
  }

  if (!shouldPushRemote({ event, durationSec, thresholdSeconds: config.thresholdSeconds })) {
    return;
  }

  const results = await pushAll(config, msg, { dryRun });
  for (const r of results) {
    if (r.dryRun) console.log(`[dry-run] ${r.name}: POST ${r.url}\n  ${r.body}`);
    else if (!r.ok) console.error(`${r.name} failed: ${r.error}`);
  }
}

async function readPayload(args) {
  // Codex style: JSON as a positional argument.
  const positional = args._.find((a) => a.trim().startsWith("{"));
  if (positional) return safeParse(positional);
  // Claude style: JSON on stdin.
  if (process.stdin.isTTY) return {};
  const data = await readStdin(1500);
  return safeParse(data);
}

function safeParse(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
