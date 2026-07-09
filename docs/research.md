# agent-notify — AI 编码代理任务完成通知工具

> 目标：Claude Code / Codex（CLI 或桌面 App）执行完任务后，实时通知我。

## 一、结论先行

**这个需求已有现成方案，不必从零造轮子：**

| 方案 | 说明 | 适合场景 |
|------|------|----------|
| [code-notify](https://github.com/mylee04/code-notify) | 开源，跨平台（含 Windows），同时支持 Claude Code / Codex / Gemini CLI，系统通知 + 声音 + 语音 + Slack/Discord webhook | 开箱即用，首选 |
| Claude Code 官方 Hooks | `Stop` / `Notification` 钩子，官方机制，配一段 PowerShell 即可弹 Windows 通知 | 零依赖、完全可控 |
| Codex 官方 notify | `~/.codex/config.toml` 里 `notify = [...]`，任务完成时调用任意脚本（收到 JSON 事件） | 零依赖、完全可控 |
| [CCNotify](https://github.com/dazuiba/CCNotify) | 只支持 Claude Code，通知「需要输入」和「任务完成」 | 只用 Claude Code 时 |

**自研的价值点**（如果要做）：现成工具都只做「本机桌面通知」，缺**手机端实时推送**（人离开电脑时）。自研一个统一 notifier，本机弹 toast + 推送到手机（Bark / ntfy / Server酱 / 企业微信机器人），才是差异化。

## 二、官方机制速查

### Claude Code（CLI 和桌面 App 共用同一套 hooks 配置）

`~/.claude/settings.json`：

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "powershell -NoProfile -File C:/claud-code/idea/agent-notify/notify.ps1 -Source claude -Event done"
      }]
    }],
    "Notification": [{
      "hooks": [{
        "type": "command",
        "command": "powershell -NoProfile -File C:/claud-code/idea/agent-notify/notify.ps1 -Source claude -Event need-input"
      }]
    }]
  }
}
```

- `Stop`：Claude 完成一轮任务时触发
- `Notification`：Claude 等待授权/输入时触发（同样重要——卡住等你点确认也该通知）
- hook 从 stdin 收到 JSON（含会话、工作目录等），脚本可解析后定制通知文案

### Codex CLI

`~/.codex/config.toml`（注意 `notify` 是根键，要放在所有 `[table]` 之前）：

```toml
notify = ["powershell", "-NoProfile", "-File", "C:/claud-code/idea/agent-notify/notify.ps1", "-Source", "codex"]

[tui]
notifications = true
```

- 目前只有 `agent-turn-complete` 事件，JSON 作为最后一个参数传入

## 三、自研方案设计（若决定做）

```
Claude Code hook ─┐
                  ├─→ notify.ps1（或单个小 exe）
Codex notify ─────┘        ├─ Windows Toast（BurntToast 或 WinRT API）
                           ├─ 提示音
                           └─ 手机推送（Bark / ntfy.sh / Server酱 / 企微机器人，可配置开关）
```

- **v1**：一个 `notify.ps1`，参数 `-Source`、`-Event`，弹 toast + 播声音，两边 hook 各配一行 → 半小时搞定
- **v2**：加手机推送（读同目录 `config.json` 里的 Bark/ntfy 地址），只在「距离触发超过 N 分钟的长任务」才推手机，避免打扰
- **v3（产品化方向）**：打包成带托盘图标的小工具，自动写入两家配置、通知历史列表、按项目分组——和 stock-widget 一样走「桌面小工具」路线

## 四、参考链接

- Claude Code Hooks 官方文档：https://code.claude.com/docs/en/hooks-guide
- code-notify：https://github.com/mylee04/code-notify
- CCNotify：https://github.com/dazuiba/CCNotify
- codex-notify-chime：https://github.com/Stovoy/codex-notify-chime
- Codex 通知配置实践：https://wow.pjh.is/journal/coding-agent-notifications
