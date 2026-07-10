# afk-notify

**AI 编码代理跑完任务，第一时间通知你——尤其是你不在电脑前的时候。**

支持 **Claude Code** 和 **Codex CLI**。人在电脑前弹桌面通知；任务跑得够久（说明你多半走开了）就推送到手机：**企业微信 / 钉钉 / 飞书 / Slack / Discord / ntfy**。

[English](./README.md)

## 为什么需要它

你让 Claude 跑一个长任务，切去干别的，20 分钟后回来发现它 18 分钟前就跑完了——或者更糟：它一直卡在那儿等你授权。

- ✅ **任务完成** → 桌面通知必弹；任务耗时 ≥ 45 秒（可配置）才推手机/IM，短任务不骚扰你。Windows 上这条通知比普通通知多停留一会儿，然后自动收起，不用你点。
- ⏳ **等你授权** → 立即全渠道推送，这条最不能错过；Windows 上这条桌面通知会常驻屏幕直到被关闭。不需要你先手动点掉它——在 CLI 里同意（或者回复 Claude）之后，一旦这个等待真正结束，它会自动消失。
- 🔒 **默认保护隐私** → 通知只含代理名、项目文件夹名、耗时，不含对话和代码内容（可选开启摘要）。

| | Claude Code | Codex CLI |
|---|---|---|
| 任务完成通知 | ✅ | ✅ |
| 等待授权提醒 | ✅ | —（Codex 官方暂未开放该事件） |

## 快速开始

```bash
npm install -g afk-notify
afk-notify init          # 自动配置 Claude Code hooks + Codex notify
```

然后编辑 `~/.afk-notify/config.json`，启用至少一个通道（粘贴你的 webhook），验证：

```bash
afk-notify test
```

重启代理会话即可生效。

## 通道配置

全部是免费 webhook——无需服务器、无需注册账号，除了发往你自己配置的通道，数据不出你的机器。

| 通道 | 配置方法（约 1 分钟） |
|---|---|
| **企业微信** | 建群 → 添加「群机器人」→ 复制 webhook 地址 |
| **钉钉** | 建群 → 添加「自定义机器人」→ 安全设置选「**加签**」（粘贴 webhook + `SEC…` 密钥）或「**自定义关键词**」（在 config 里填同一个关键词） |
| **飞书** | 建群 → 添加「自定义机器人」→ 复制 webhook（签名密钥可选） |
| **Slack** | 创建 [incoming webhook](https://api.slack.com/messaging/webhooks)，粘贴 URL |
| **Discord** | 频道设置 → 整合 → Webhook → 新建，粘贴 URL |
| **ntfy** | 手机装 [ntfy App](https://ntfy.sh)，订阅 config 里自动生成的随机 topic |

> 提示：建一个只有你自己的小群给机器人用，并且**不要把这个群设为免打扰**，否则手机不弹横幅。

配置示例：

```jsonc
{
  "thresholdSeconds": 45,     // 任务耗时达到该秒数才推远程通道
  "includeSummary": false,    // true = 完成通知附带代理的最后一条消息摘要
  "toast": true,              // 桌面通知（Windows / macOS）
  "channels": {
    "wecom": { "enabled": true, "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" }
  }
}
```

## 工作原理

`afk-notify init` 只是接上两个代理官方的扩展点——没有常驻进程、不轮询：

- **Claude Code**（`~/.claude/settings.json`）：`UserPromptSubmit` 记录开始时间，`Stop` 触发完成通知，`Notification` 触发等授权提醒，`PostToolUse`（工具真正执行后触发——包括你刚同意的那次）在等待结束的那一刻自动关掉对应提醒。你已有的 hooks 原样保留；重复运行 init 不会产生重复条目；每次修改前自动备份 `.afk-notify.bak`。
- **Codex CLI**（`~/.codex/config.toml`）：写入 `notify = […]`（如果你已有自己的 notify 配置，会拒绝覆盖并提示手动合并）。

`afk-notify uninstall` 只移除 init 添加的内容，其他一概不动。

**升级说明：** 只要你之前跑过一次 `init`，之后每次 `npm update -g afk-notify` 都会自动重新同步你的钩子（靠一个 `postinstall` 脚本），所以新版本加了新的钩子类型——比如这次用来自动关闭"等待授权"通知的 `PostToolUse`——升级后就能直接用，不用再手动跑一遍 init。从没跑过 init 的机器上，这个脚本什么都不会做。

## 命令

```
afk-notify init [--claude] [--codex]   配置代理（幂等）
afk-notify test [--dry-run]            向所有已启用通道发测试通知
afk-notify config                      查看配置路径与内容（密钥脱敏）
afk-notify uninstall [--purge]         移除 hooks；--purge 同时删除 ~/.afk-notify
```

## 常见问题

**数据会发给第三方吗？** 只有发往你自己配置的 webhook 的那一个 HTTP POST。没有遥测，没有中间服务器。

**短任务为什么手机没响？** 设计如此——低于 `thresholdSeconds` 的任务只弹桌面通知。想全部推送就把它设为 `0`。

**Linux 能用吗？** 远程通道全平台可用；桌面通知在有 `notify-send` 时可用。

**为什么"等你授权"的通知在 mac 上没有常驻不消失？** 这是系统限制——Windows 上用的是常驻式通知（`scenario="reminder"`），需要手动或自动关闭；macOS 的 `osascript` 没有对应的手段能强制横幅常驻，是否常驻由系统「通知与专注模式」设置决定，afk-notify 改不了。Linux 同理，取决于你的通知守护进程。同样原因，"同意后自动消失"目前也只在 Windows 上生效。

**webhook 存在哪里？** 明文存于 `~/.afk-notify/config.json`（信任模型同 `.npmrc`）。请像对待密码一样对待 webhook 地址；`afk-notify config` 打印时会自动脱敏。

## License

MIT
