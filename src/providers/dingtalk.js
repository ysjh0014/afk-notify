import crypto from "node:crypto";

// DingTalk (钉钉) custom robot webhook. Security must be one of:
// - "加签" (HMAC signature): set channel.secret (starts with "SEC")
// - "自定义关键词": set channel.keyword to the configured keyword
// Docs: https://open.dingtalk.com/document/robots/custom-robot-access
export function sign(secret, timestampMs) {
  const stringToSign = `${timestampMs}\n${secret}`;
  const hmac = crypto.createHmac("sha256", secret).update(stringToSign, "utf8").digest("base64");
  return encodeURIComponent(hmac);
}

export function buildRequest(channel, msg, now = Date.now()) {
  let url = channel.webhook;
  if (channel.secret) {
    url += `&timestamp=${now}&sign=${sign(channel.secret, now)}`;
  }
  let title = msg.title;
  if (channel.keyword && !title.includes(channel.keyword)) {
    title = `${channel.keyword} ${title}`;
  }
  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { title, text: `### ${title}\n\n${msg.body.replace(/\n/g, "\n\n")}` }
      })
    }
  };
}

export function checkBody(text) {
  const data = JSON.parse(text);
  if (data.errcode !== 0) throw new Error(`DingTalk error ${data.errcode}: ${data.errmsg}`);
}
