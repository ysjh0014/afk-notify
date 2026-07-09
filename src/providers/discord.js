// Discord channel webhook.
// Docs: https://discord.com/developers/docs/resources/webhook#execute-webhook
const COLOR_NORMAL = 0x57f287; // green
const COLOR_HIGH = 0xe8a33d; // orange

export function buildRequest(channel, msg) {
  return {
    url: channel.webhook,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: msg.title,
            description: msg.body,
            color: msg.priority === "high" ? COLOR_HIGH : COLOR_NORMAL
          }
        ]
      })
    }
  };
}
