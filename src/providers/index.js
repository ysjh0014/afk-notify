import * as wecom from "./wecom.js";
import * as dingtalk from "./dingtalk.js";
import * as feishu from "./feishu.js";
import * as slack from "./slack.js";
import * as discord from "./discord.js";
import * as ntfy from "./ntfy.js";
import { maskSecret } from "../core/config.js";

export const PROVIDERS = { wecom, dingtalk, feishu, slack, discord, ntfy };

const TIMEOUT_MS = 10_000;

export async function sendVia(name, channel, msg) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown channel: ${name}`);
  const { url, init } = provider.buildRequest(channel, msg);
  if (!url) throw new Error("webhook/server is not configured");
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  provider.checkBody?.(text);
}

// Sends msg to every enabled channel. Never throws: returns
// [{ name, ok, error?, skipped? }] so one failing channel can't
// block the others.
export async function pushAll(config, msg, { dryRun = false } = {}) {
  const jobs = Object.entries(config.channels ?? {})
    .filter(([name, channel]) => channel?.enabled && PROVIDERS[name])
    .map(async ([name, channel]) => {
      if (dryRun) {
        const { url, init } = PROVIDERS[name].buildRequest(channel, msg);
        return { name, ok: true, dryRun: true, url: maskSecret(url), body: init.body };
      }
      try {
        await sendVia(name, channel, msg);
        return { name, ok: true };
      } catch (err) {
        return { name, ok: false, error: err.message };
      }
    });
  return Promise.all(jobs);
}
