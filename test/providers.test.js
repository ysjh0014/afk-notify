import { test } from "node:test";
import assert from "node:assert/strict";
import * as wecom from "../src/providers/wecom.js";
import * as dingtalk from "../src/providers/dingtalk.js";
import * as feishu from "../src/providers/feishu.js";
import * as slack from "../src/providers/slack.js";
import * as discord from "../src/providers/discord.js";
import * as ntfy from "../src/providers/ntfy.js";

const MSG = { title: "✅ [Claude Code] Task finished · demo", body: "Duration: 2m5s", priority: "normal" };
const HIGH = { ...MSG, priority: "high" };

test("wecom builds markdown payload", () => {
  const { url, init } = wecom.buildRequest({ webhook: "https://wecom.example/hook" }, MSG);
  assert.equal(url, "https://wecom.example/hook");
  const body = JSON.parse(init.body);
  assert.equal(body.msgtype, "markdown");
  assert.ok(body.markdown.content.includes(MSG.title));
});

test("wecom checkBody throws on errcode", () => {
  assert.throws(() => wecom.checkBody('{"errcode":93000,"errmsg":"invalid webhook url"}'), /93000/);
  wecom.checkBody('{"errcode":0,"errmsg":"ok"}');
});

test("dingtalk signs url when secret is set", () => {
  const now = 1700000000000;
  const { url } = dingtalk.buildRequest(
    { webhook: "https://oapi.dingtalk.com/robot/send?access_token=t", secret: "SECabc" },
    MSG,
    now
  );
  assert.ok(url.includes(`timestamp=${now}`));
  assert.ok(url.includes("&sign="));
  // signature is deterministic
  assert.equal(dingtalk.sign("SECabc", now), dingtalk.sign("SECabc", now));
});

test("dingtalk prepends keyword when missing from title", () => {
  const { init } = dingtalk.buildRequest({ webhook: "https://d.example", keyword: "通知" }, MSG);
  const body = JSON.parse(init.body);
  assert.ok(body.markdown.title.startsWith("通知 "));
});

test("feishu builds interactive card with priority color", () => {
  const normal = JSON.parse(feishu.buildRequest({ webhook: "https://f.example" }, MSG).init.body);
  assert.equal(normal.card.header.template, "green");
  const high = JSON.parse(feishu.buildRequest({ webhook: "https://f.example" }, HIGH).init.body);
  assert.equal(high.card.header.template, "orange");
});

test("feishu includes timestamp+sign when secret is set", () => {
  const nowSec = 1700000000;
  const body = JSON.parse(feishu.buildRequest({ webhook: "https://f.example", secret: "s" }, MSG, nowSec).init.body);
  assert.equal(body.timestamp, String(nowSec));
  assert.equal(body.sign, feishu.sign("s", nowSec));
});

test("slack builds text payload", () => {
  const body = JSON.parse(slack.buildRequest({ webhook: "https://s.example" }, MSG).init.body);
  assert.ok(body.text.includes(MSG.title));
});

test("discord builds embed with color", () => {
  const body = JSON.parse(discord.buildRequest({ webhook: "https://d.example" }, HIGH).init.body);
  assert.equal(body.embeds.length, 1);
  assert.equal(body.embeds[0].color, 0xe8a33d);
});

test("ntfy posts JSON to server root with topic", () => {
  const { url, init } = ntfy.buildRequest({ server: "https://ntfy.sh/", topic: "afk-x" }, HIGH);
  assert.equal(url, "https://ntfy.sh");
  const body = JSON.parse(init.body);
  assert.equal(body.topic, "afk-x");
  assert.equal(body.priority, 5);
  assert.equal(body.title, HIGH.title);
});
