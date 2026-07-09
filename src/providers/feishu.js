import crypto from "node:crypto";

// Feishu / Lark (飞书) custom robot webhook, interactive card message.
// Docs: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
export function sign(secret, timestampSec) {
  // Feishu uses `${timestamp}\n${secret}` as the HMAC key over an empty message.
  return crypto.createHmac("sha256", `${timestampSec}\n${secret}`).update("").digest("base64");
}

export function buildRequest(channel, msg, nowSec = Math.floor(Date.now() / 1000)) {
  const payload = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: msg.title },
        template: msg.priority === "high" ? "orange" : "green"
      },
      elements: [{ tag: "div", text: { tag: "lark_md", content: msg.body } }]
    }
  };
  if (channel.secret) {
    payload.timestamp = String(nowSec);
    payload.sign = sign(channel.secret, nowSec);
  }
  return {
    url: channel.webhook,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  };
}

export function checkBody(text) {
  const data = JSON.parse(text);
  // Success responses carry code 0 (newer) or StatusCode 0 (legacy).
  const code = data.code ?? data.StatusCode;
  if (code !== 0) throw new Error(`Feishu error ${code}: ${data.msg ?? text}`);
}
