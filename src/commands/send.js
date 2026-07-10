import path from "node:path";
import { loadConfig } from "../core/config.js";
import { resolveLang } from "../core/i18n.js";
import { buildMessage } from "../core/message.js";
import { markStart, endSession, markWaiting, takeWaitingTag, toastTag } from "../core/session.js";
import { shouldPushRemote } from "../core/policy.js";
import { lastAssistantText, lastToolUse, describeToolUse } from "../core/transcript.js";
import { pushAll } from "../providers/index.js";
import { toast, dismissToast } from "../providers/toast.js";

// Best-effort: if a "waiting for approval" toast is still pending for this
// session, dismiss it — the CLI/desktop client resolving the wait (a tool
// ran, or the user replied) means the toast has already done its job.
async function dismissPendingWaiting(sessionKey) {
  const tag = takeWaitingTag(sessionKey);
  if (!tag) return;
  try {
    await dismissToast({ tag });
  } catch {
    // the toast may already be gone (manually dismissed) — nothing to do
  }
}

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

  if (event !== "waiting") {
    await dismissPendingWaiting(sessionKey);
  }

  if (event === "start") {
    markStart(sessionKey);
    return;
  }

  // PostToolUse: only here to catch the "approved, waiting toast dismissed"
  // moment above — no toast/remote push of its own.
  if (event === "resume") {
    return;
  }

  const config = loadConfig();
  const cwd = payload.cwd || process.cwd();
  const project = path.basename(cwd);

  const durationSec = event === "done" ? endSession(sessionKey) : null;

  // Read once, used both to pick zh/en (matches what the agent is actually
  // speaking, not the OS locale) and, if enabled, as the "done" summary.
  const assistantText = lastAssistantText(payload.transcript_path);
  const lang = resolveLang(config, assistantText);

  // The Notification hook message ("Claude needs your permission to…")
  // is not conversation content, so it is always safe to include.
  let summary = event === "waiting" ? payload.message ?? null : null;
  if (config.includeSummary && event === "done") {
    summary = assistantText;
  }
  if (config.includeSummary && event === "waiting") {
    // Claude Code's own message can be as generic as "Claude needs your
    // permission" — name the actual pending tool call when we can.
    const detail = describeToolUse(lastToolUse(payload.transcript_path));
    if (detail) summary = summary ? `${summary}\n${detail}` : detail;
  }

  const msg = buildMessage({ source, event, project, durationSec, summary, lang });

  if (config.toast) {
    const tag = toastTag(sessionKey);
    if (dryRun) {
      console.log(`[dry-run] toast: ${msg.title} — ${msg.body}`);
    } else {
      try {
        await toast(msg, { persistent: event === "waiting", tag });
        if (event === "waiting") markWaiting(sessionKey, tag);
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
