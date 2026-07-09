// ntfy.sh (or self-hosted ntfy server), JSON publishing mode —
// unlike header-based publishing it fully supports UTF-8 titles.
// Docs: https://docs.ntfy.sh/publish/#publish-as-json
export function buildRequest(channel, msg) {
  const server = (channel.server || "https://ntfy.sh").replace(/\/+$/, "");
  return {
    url: server,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: channel.topic,
        title: msg.title,
        message: msg.body,
        priority: msg.priority === "high" ? 5 : 3,
        tags: [msg.priority === "high" ? "hourglass_flowing_sand" : "white_check_mark"]
      })
    }
  };
}
