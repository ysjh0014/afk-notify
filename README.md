# afk-notify

**Get pinged when your AI coding agent finishes — especially when you're AFK.**

Works with **Claude Code** and **Codex CLI**. Desktop toast when you're at your desk; push to your phone via **WeCom / DingTalk / Feishu / Slack / Discord / ntfy** when the task ran long enough that you probably walked away.

[中文文档](./README.zh-CN.md)

## Why

You kick off a long agent task, switch to something else, and come back 20 minutes later to find it finished 18 minutes ago — or worse, it's been sitting there waiting for your permission the whole time.

- ✅ **Task finished** → toast always; phone/IM push only if the task ran ≥ 45s (configurable). Short tasks don't spam you. On Windows the toast lingers a bit longer than a normal notification, then auto-hides on its own — no click required.
- ⏳ **Agent waiting for your approval** → pushed immediately, everywhere. This is the one you really can't miss; on Windows this desktop toast stays pinned on screen until it's dismissed. You don't have to click it yourself first: approving in the CLI (or replying to Claude) dismisses it automatically the moment the wait is actually over.
- 🔒 **Private by default** → notifications carry only the agent name, project folder name, and duration. No conversation or code content unless you opt in.

| | Claude Code | Codex CLI |
|---|---|---|
| Task finished | ✅ | ✅ |
| Waiting for approval | ✅ | — (Codex doesn't expose this event yet) |

## Quick start

```bash
npm install -g afk-notify
afk-notify init          # auto-configures Claude Code hooks + Codex notify
```

Then enable at least one channel in `~/.afk-notify/config.json` (paste your webhook), and verify:

```bash
afk-notify test
```

Restart your agent session. Done.

## Channels

All channels are free webhooks — no server, no account with us, nothing leaves your machine except the HTTP call to the channel you chose.

| Channel | Setup (~1 minute) |
|---|---|
| **Slack** | Create an [incoming webhook](https://api.slack.com/messaging/webhooks), paste the URL |
| **Discord** | Channel settings → Integrations → Webhooks → New, paste the URL |
| **ntfy** | Install the [ntfy app](https://ntfy.sh), subscribe to the auto-generated random topic shown in your config |
| **WeCom (企业微信)** | Create a group → add a Group Robot → paste the webhook URL |
| **DingTalk (钉钉)** | Create a group → add a Custom Robot → choose **Sign** security (paste webhook + `SEC…` secret) or **Keyword** (set the same keyword in config) |
| **Feishu (飞书)** | Create a group → add a Custom Bot → paste the webhook URL (+ optional signing secret) |

> Tip for the IM channels: make a group with just yourself, and don't mute it — muted groups won't show banners on your phone.

Example config:

```jsonc
{
  "thresholdSeconds": 45,     // push to remote channels only if the task ran at least this long
  "includeSummary": false,    // true = include the agent's last message in "done" notifications
  "toast": true,              // desktop toast (Windows / macOS)
  "channels": {
    "slack":   { "enabled": true, "webhook": "https://hooks.slack.com/services/…" },
    "ntfy":    { "enabled": true, "server": "https://ntfy.sh", "topic": "afk-notify-a1b2c3d4e5" }
  }
}
```

## How it works

`afk-notify init` wires up the agents' own extension points — no daemon, no polling:

- **Claude Code** (`~/.claude/settings.json`): `UserPromptSubmit` records a start timestamp, `Stop` fires the "finished" notification, `Notification` fires the "waiting for approval" alert, `PostToolUse` (fires right after a tool actually runs — including the one you just approved) auto-dismisses that alert once the wait is over. Your existing hooks are preserved; running `init` twice won't duplicate anything; a `.afk-notify.bak` backup is written before every change.
- **Codex CLI** (`~/.codex/config.toml`): adds a `notify = […]` entry (refuses to overwrite one you already have).

`afk-notify uninstall` removes exactly what `init` added and nothing else.

**Upgrading:** if you've already run `init` once, every `npm update -g afk-notify` automatically re-syncs your hooks (a `postinstall` script), so a new version that adds a new hook type — like `PostToolUse` for auto-dismissing "waiting" toasts — just works after you upgrade. Nothing runs on a machine that never opted in by running `init`.

## Commands

```
afk-notify init [--claude] [--codex]   configure agents (idempotent)
afk-notify test [--dry-run]            send a test notification to all enabled channels
afk-notify config                      show config path + current config (secrets masked)
afk-notify uninstall [--purge]         remove hooks; --purge also deletes ~/.afk-notify
```

## FAQ

**Does anything get sent to a third party?** Only the HTTP POST to the webhook(s) *you* configured. There is no telemetry and no middleman server.

**Why didn't my phone buzz for a short task?** By design — tasks under `thresholdSeconds` only show a desktop toast. Set it to `0` to push everything.

**Linux?** Remote channels work everywhere; desktop toast uses `notify-send` if available.

**Why doesn't the "waiting for approval" toast stay pinned on macOS too?** Platform limitation — Windows uses a persistent toast (`scenario="reminder"`) that requires dismissal (manual, or automatic once you resolve the wait). macOS's `osascript` has no equivalent way to force a banner to stay on screen; that's controlled by the system's Notifications & Focus settings, not something afk-notify can override. Same story on Linux — it depends on your notification daemon. For the same reason, auto-dismiss-on-approval is currently Windows-only.

**Where are my webhooks stored?** Plaintext in `~/.afk-notify/config.json` (same trust model as `.npmrc`). Treat webhook URLs like passwords; `afk-notify config` masks them when printing.

## License

MIT
