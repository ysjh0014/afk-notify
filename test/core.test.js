import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shouldPushRemote } from "../src/core/policy.js";
import { buildMessage, formatDuration } from "../src/core/message.js";
import { loadConfig, configPath, maskedConfig, defaultConfig } from "../src/core/config.js";
import { markStart, endSession } from "../src/core/session.js";

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
