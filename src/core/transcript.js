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

// Reads the most recent assistant message out of a Claude Code transcript
// (JSONL, one message per line). Returns null on any missing/unreadable/empty
// file instead of throwing — this is best-effort context, not a hard dependency.
export function lastAssistantText(transcriptPath) {
  if (!transcriptPath) return null;
  let raw;
  try {
    raw = readTail(transcriptPath);
  } catch {
    return null;
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
    if (entry?.type !== "assistant") continue;
    const text = extractText(entry.message?.content).trim();
    if (text) return text;
  }
  return null;
}

const CJK_RE = /[㐀-鿿豈-﫿]/;

// Cheap language hint from a text sample: any CJK ideograph found -> "zh".
// Good enough to tell "the conversation is in Chinese" apart from everything else.
export function detectLangFromText(text) {
  if (!text) return null;
  return CJK_RE.test(text) ? "zh" : "en";
}
