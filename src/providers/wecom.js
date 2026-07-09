// WeCom (企业微信) group robot webhook.
// Docs: https://developer.work.weixin.qq.com/document/path/91770
export function buildRequest(channel, msg) {
  return {
    url: channel.webhook,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { content: `**${msg.title}**\n${msg.body}` }
      })
    }
  };
}

export function checkBody(text) {
  const data = JSON.parse(text);
  if (data.errcode !== 0) throw new Error(`WeCom error ${data.errcode}: ${data.errmsg}`);
}
