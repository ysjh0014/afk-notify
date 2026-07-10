import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shouldPushRemote } from "../src/core/policy.js";
import { buildMessage, formatDuration } from "../src/core/message.js";
import { loadConfig, configPath, maskedConfig, defaultConfig } from "../src/core/config.js";
import { markStart, endSession, markWaiting, takeWaitingTag, toastTag } from "../src/core/session.js";
import { lastAssistantText, lastToolUse, describeToolUse, detectLangFromText } from "../src/core/transcript.js";
import { resolveLang } from "../src/core/i18n.js";
import { dismissToast } from "../src/providers/toast.js";

beforeEach(() => {
  process.env.AFK_NOTIFY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "afk-test-"));
});

test("policy: waiting always pushes remote", () => {
  assert.equal(shouldPushRemote({ event: "waiting", durationSec: 0, thresholdSeconds: 45 }), true);
});

test("policy: done pushes only at/above threshold", () => {
  assert.equal(shouldPushRemote({ event: "done", durationSec: 44, thresholdSeconds: 45 }), false);
  assert.equal(shouldPushRemote({ event: "done", durationSec: 45, thresholdSeconds: 45 }), true);
});

test("policy: unknown duration is treated as long", () => {
  assert.equal(shouldPushRemote({ event: "done", durationSec: null, thresholdSeconds: 45 }), true);
});

test("policy: start never pushes", () => {
  assert.equal(shouldPushRemote({ event: "start", durationSec: null, thresholdSeconds: 45 }), false);
});

test("formatDuration", () => {
  assert.equal(formatDuration(5), "5s");
  assert.equal(formatDuration(125), "2m5s");
  assert.equal(formatDuration(3720), "1h2m");
  assert.equal(formatDuration(null), null);
});

test("buildMessage: waiting is high priority with hourglass", () => {
  const msg = buildMessage({ source: "claude", event: "waiting", project: "demo", lang: "en" });
  assert.equal(msg.priority, "high");
  assert.ok(msg.title.includes("Claude Code"));
  assert.ok(msg.title.includes("demo"));
});

test("buildMessage: long summary is truncated", () => {
  const msg = buildMessage({ source: "codex", event: "done", summary: "x".repeat(500), lang: "en" });
  assert.ok(msg.body.length < 300);
  assert.ok(msg.body.endsWith("…"));
});

test("config: created with defaults, ntfy topic is random", () => {
  const config = loadConfig();
  assert.equal(config.thresholdSeconds, 45);
  assert.match(config.channels.ntfy.topic, /^afk-notify-[0-9a-f]{10}$/);
});

test("config: tolerates UTF-8 BOM and merges defaults for missing keys", () => {
  loadConfig();
  fs.writeFileSync(configPath(), "﻿" + JSON.stringify({ thresholdSeconds: 90 }));
  const config = loadConfig();
  assert.equal(config.thresholdSeconds, 90);
  assert.ok(config.channels.wecom); // defaults merged back in
});

test("config: maskedConfig hides webhooks and secrets", () => {
  const config = defaultConfig();
  config.channels.wecom.webhook = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=very-secret-key";
  const masked = maskedConfig(config);
  assert.ok(!masked.channels.wecom.webhook.includes("very-secret-key"));
});

test("session: start/end roundtrip measures duration", async () => {
  markStart("claude-abc");
  await new Promise((r) => setTimeout(r, 30));
  const sec = endSession("claude-abc");
  assert.ok(sec !== null && sec >= 0);
  assert.equal(endSession("claude-abc"), null); // consumed
});

test("session: unknown session returns null", () => {
  assert.equal(endSession("claude-never-started"), null);
});

test("session: waiting tag roundtrips and is consumed once", () => {
  const tag = toastTag("claude-abc123");
  markWaiting("claude-abc123", tag);
  assert.equal(takeWaitingTag("claude-abc123"), tag);
  assert.equal(takeWaitingTag("claude-abc123"), null); // consumed
});

test("session: no pending waiting tag returns null", () => {
  assert.equal(takeWaitingTag("claude-never-waited"), null);
});

test("toastTag: sanitizes to a filesystem/tag-safe string", () => {
  assert.equal(toastTag("claude-abc/123 def"), "claude-abc_123_def");
});

test("dismissToast: no-op without a tag (nothing was ever shown)", async () => {
  await assert.doesNotReject(dismissToast({}));
  await assert.doesNotReject(dismissToast());
});

test("detectLangFromText: CJK text is zh, everything else is en", () => {
  assert.equal(detectLangFromText("已修复 winToast 函数"), "zh");
  assert.equal(detectLangFromText("Fixed the winToast function"), "en");
  assert.equal(detectLangFromText(""), null);
  assert.equal(detectLangFromText(null), null);
});

test("resolveLang: sample text wins over system locale when lang is auto", () => {
  assert.equal(resolveLang({ lang: "auto" }, "已完成任务"), "zh");
  assert.equal(resolveLang({ lang: "auto" }, "Task finished"), "en");
});

test("resolveLang: explicit config.lang always wins over sample text", () => {
  assert.equal(resolveLang({ lang: "en" }, "已完成任务"), "en");
});

test("lastAssistantText: reads the most recent assistant message from a JSONL transcript", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "afk-transcript-")), "session.jsonl");
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "fix the bug" } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Looking into it." }] } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }] } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Fixed the bug." }] } })
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  assert.equal(lastAssistantText(file), "Fixed the bug.");
});

test("lastAssistantText: missing file or path returns null instead of throwing", () => {
  assert.equal(lastAssistantText(null), null);
  assert.equal(lastAssistantText("/no/such/file.jsonl"), null);
});

test("lastToolUse: finds the most recent pending tool call, text-only messages don't count", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "afk-transcript-")), "session.jsonl");
  const lines = [
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: "old.js" } }] } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Now running the fix." }] } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "git push origin main" } }] } })
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n");
  const use = lastToolUse(file);
  assert.equal(use.name, "Bash");
  assert.equal(use.input.command, "git push origin main");
});

test("describeToolUse: prefers a known argument, falls back to the tool name", () => {
  assert.equal(describeToolUse({ name: "Bash", input: { command: "git push origin main" } }), "Bash: git push origin main");
  assert.equal(describeToolUse({ name: "AskUserQuestion", input: { questions: [] } }), "AskUserQuestion");
  assert.equal(describeToolUse(null), null);
});

test("describeToolUse: long arguments are truncated", () => {
  const desc = describeToolUse({ name: "Bash", input: { command: "x".repeat(200) } });
  assert.ok(desc.length < 140);
  assert.ok(desc.endsWith("…"));
});
