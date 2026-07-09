// Slack incoming webhook.
// Docs: https://api.slack.com/messaging/webhooks
export function buildRequest(channel, msg) {
  return {
    url: channel.webhook,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${msg.title}*\n${msg.body}` })
    }
  };
}
