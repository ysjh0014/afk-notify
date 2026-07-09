import { t } from "./i18n.js";

const SOURCE_LABELS = {
  claude: "Claude Code",
  codex: "Codex"
};

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
}

const MAX_SUMMARY = 200;

export function buildMessage({ source, event, project, durationSec, summary, lang }) {
  const label = SOURCE_LABELS[source] ?? source;
  const waiting = event === "waiting";
  const icon = waiting ? "⏳" : "✅";
  const eventText = t(lang, waiting ? "waiting" : "done");
  const title = `${icon} [${label}] ${eventText}${project ? ` · ${project}` : ""}`;

  const parts = [];
  const duration = formatDuration(durationSec);
  if (duration) parts.push(`${t(lang, "duration")}: ${duration}`);
  if (summary) {
    const trimmed = summary.replace(/\s+/g, " ").trim();
    if (trimmed) {
      parts.push(trimmed.length > MAX_SUMMARY ? trimmed.slice(0, MAX_SUMMARY) + "…" : trimmed);
    }
  }
  const body = parts.join("\n") || eventText;

  return { title, body, priority: waiting ? "high" : "normal" };
}
