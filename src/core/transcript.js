import fs from "node:fs";

// Only the last message is ever needed, and transcripts are append-only JSONL,
// so reading the final chunk avoids loading a long session's full history.
const TAIL_BYTES = 65536;

function readTail(filePath) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - TAIL_BYTES);
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block?.type === "tool_use" && typeof block.name === "string");
}

// Yields assistant message content arrays from a Claude Code transcript
// (JSONL, one entry per line), most recent first. Best-effort: any
// missing/unreadable/malformed file just yields nothing instead of throwing.
function* recentAssistantMessages(transcriptPath) {
  if (!transcriptPath) return;
  let raw;
  try {
    raw = readTail(transcriptPath);
  } catch {
    return;
  }
  const lines = raw.split("\n");
  // A tail read may start mid-line; that fragment can't be parsed, drop it.
  if (lines.length > 1) lines.shift();
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "assistant") yield entry.message?.content;
  }
}

// Most recent assistant reply text — used as the "task finished" summary and
// as a language sample (matches what the agent is actually saying).
export function lastAssistantText(transcriptPath) {
  for (const content of recentAssistantMessages(transcriptPath)) {
    const text = extractText(content).trim();
    if (text) return text;
  }
  return null;
}

// Most recent tool call — used to describe *what* a pending permission
// request is actually for, since Claude Code's own Notification message can
// be as generic as "Claude needs your permission".
export function lastToolUse(transcriptPath) {
  for (const content of recentAssistantMessages(transcriptPath)) {
    const uses = extractToolUses(content);
    if (uses.length) return uses[uses.length - 1];
  }
  return null;
}

const DETAIL_KEYS = ["command", "file_path", "path", "url", "pattern", "query", "prompt", "description"];
const MAX_DETAIL = 120;

// Short "ToolName: key argument" string for a tool_use block, e.g.
// "Bash: git push origin main". Falls back to just the tool name when the
// input doesn't have a field worth showing.
export function describeToolUse(toolUse) {
  if (!toolUse?.name) return null;
  const input = toolUse.input;
  if (input && typeof input === "object") {
    for (const key of DETAIL_KEYS) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) {
        const flat = value.trim().replace(/\s+/g, " ");
        const short = flat.length > MAX_DETAIL ? flat.slice(0, MAX_DETAIL) + "…" : flat;
        return `${toolUse.name}: ${short}`;
      }
    }
  }
  return toolUse.name;
}

const CJK_RE = /[㐀-鿿豈-﫿]/;

// Cheap language hint from a text sample: any CJK ideograph found -> "zh".
// Good enough to tell "the conversation is in Chinese" apart from everything else.
export function detectLangFromText(text) {
  if (!text) return null;
  return CJK_RE.test(text) ? "zh" : "en";
}
