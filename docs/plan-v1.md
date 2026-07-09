# v1 实施计划

> 前置文档：README.md（调研）、DESIGN-phone-push.md（设计决策）。本文是可直接开工的执行清单。

## 一、v1 产品功能清单（写 README 功能表用）

### 用户可见功能

| 功能 | 说明 |
|------|------|
| 一条命令接入 | `npm i -g agent-notify` → `agent-notify init`，自动配置 Claude Code hooks + Codex config.toml |
| 任务完成通知 | Claude Code / Codex 任务跑完，本机弹 toast；超过时长阈值（默认 45s）额外推手机/IM |
| 等待授权提醒 | Claude Code 卡在等你确认时立即通知（本机 + 远程都推）。Codex 无此事件，功能表如实标注 |
| 6 个远程通道 | 企业微信、钉钉、飞书、Slack、Discord、ntfy —— 全部免费 webhook，用户自己粘 URL |
| 本机 toast | Windows + macOS（Linux v1 降级为仅远程通道） |
| 消息内容 | 来源 + 项目名（cwd basename）+ 事件 + 耗时；默认不含对话/代码内容，`includeSummary` 可开 |
| 测试与卸载 | `agent-notify test`（每个已启用通道发一条）、`agent-notify uninstall`（干净移除 hooks）、`--dry-run` |

### CLI 命令面

```
agent-notify init        # 检测 Claude/Codex 并写入 hook 配置（幂等）
agent-notify uninstall   # 精确移除自己写入的配置
agent-notify test        # 向所有启用通道发测试通知
agent-notify send        # 内部命令，被 hook 调用（stdin JSON + --source/--event 参数）
agent-notify config      # 打印配置文件路径与当前配置（脱敏显示 webhook）
```

### 配置文件 `~/.agent-notify/config.json`

```json
{
  "thresholdSeconds": 45,
  "includeSummary": false,
  "toast": true,
  "channels": {
    "wecom":   { "enabled": true,  "webhook": "https://qyapi.weixin.qq.com/..." },
    "dingtalk":{ "enabled": false, "webhook": "...", "secret": "SEC..." },
    "feishu":  { "enabled": false, "webhook": "...", "secret": "" },
    "slack":   { "enabled": false, "webhook": "..." },
    "discord": { "enabled": false, "webhook": "..." },
    "ntfy":    { "enabled": false, "server": "https://ntfy.sh", "topic": "agent-notify-<random>" }
  }
}
```

## 二、技术选型（定死，不再讨论）

- **语言/运行时**：Node ≥ 18，纯 ESM JS，**零运行时依赖**（HTTP 用内置 fetch；toast 用 child_process 调 PowerShell/osascript；参数解析手写，命令就 5 个）。零依赖 = 安装快、无供应链风险、开源可信度高。
- **toast 实现**：Windows 走 PowerShell WinRT Toast（内嵌脚本，不依赖 BurntToast 模块）；macOS 走 `osascript -e 'display notification ...'`。
- **状态目录**：`~/.agent-notify/state/{session_id}.json` 记任务开始时间戳（UserPromptSubmit 时写入，Stop 时读取算耗时并删除；孤儿文件超 24h 清理）。
- **License**：MIT。**仓库**：GitHub 公开，英文 README 为主 + README.zh-CN.md。

## 三、hook 接线细节

**Claude Code `~/.claude/settings.json`**（init 时合并写入，条目带 `"__agentNotify": true` 类标记以便幂等与卸载；实际用 command 字符串包含固定标识符来识别）：

- `UserPromptSubmit` → `agent-notify send --source claude --event start`（只记时间戳，不通知）
- `Stop` → `agent-notify send --source claude --event done`
- `Notification` → `agent-notify send --source claude --event waiting`

**Codex `~/.codex/config.toml`**（注意 notify 是根键，必须写在所有 [table] 之前）：

```toml
notify = ["agent-notify", "send", "--source", "codex", "--event", "done"]
```

Windows 下 hook/notify 可能找不到 PATH 中的 .cmd shim → init 时解析出 agent-notify 的**绝对路径**写入配置，最稳。

**send 的判定流程**（core/policy.js）：

```
event=start   → 写 state 时间戳，退出
event=waiting → toast + 所有启用通道立即推（高优先级样式）
event=done    → 算耗时 → toast 必弹；耗时 ≥ threshold 才推远程通道
```

## 四、实现步骤（按序执行，每步有验收标准）

| # | 任务 | 验收标准 |
|---|------|---------|
| 0 | 查 npm 包名占用 → git init、package.json(bin)、MIT LICENSE、目录骨架 | `npm link` 后 `agent-notify --help` 可运行 |
| 1 | config 模块 + provider 统一接口 + 先做 wecom、ntfy 两个通道 + `test` 命令 | 真实企微群/ntfy App 收到测试消息 |
| 2 | 补齐 dingtalk（加签 HMAC）、feishu（卡片）、slack、discord 四通道 | `agent-notify test` 六通道全通（用自己能建的群实测，Slack/Discord 建免费测试环境） |
| 3 | toast 模块（Win PowerShell / mac osascript）+ `send` + policy + session 耗时统计 | 手动管道喂 JSON：`echo {...} \| agent-notify send --source claude --event done` 行为符合判定流程 |
| 4 | Claude 集成：settings.json 幂等合并 + `init --claude` | 真实 Claude Code 会话：跑一个 >45s 任务收到远程推送，短任务只弹 toast，等授权立即收到通知；重复 init 不产生重复条目 |
| 5 | Codex 集成：config.toml 解析追加（根键位置正确）+ `init --codex` | 真实 Codex 任务完成收到通知 |
| 6 | `uninstall` + `--dry-run` + `config`（脱敏打印） | uninstall 后 settings.json/config.toml 恢复原样（diff 验证） |
| 7 | provider mock 单测（node:test）+ GitHub Actions CI（win + mac + ubuntu 矩阵） | CI 全绿 |
| 8 | README（英文，第一屏放 30 秒 GIF：任务完成→手机弹通知）+ README.zh-CN | 让一个没参与的人照 README 5 分钟跑通 |
| 9 | 自用一周（真实工作流跑 Claude + Codex），修打扰感/漏报 | 一周内无漏报、无烦人误报 |
| 10 | `npm publish` + 发布推广：X、Reddit r/ClaudeAI、Hacker News Show HN、V2EX、即刻 | 上线 |

工作量估计：步骤 0–6 约 2–3 个工作日（大部分 provider 是模板化 POST）；7–8 一天；9 一周日历时间（不占工时）。

## 五、v1 明确不做（防止范围蔓延）

- setup 交互式向导（v1 用 README 指引手改 config.json，v2 再做向导）
- 空闲/在场检测、quiet hours、事件合并（v2）
- Bark / Server酱 / Telegram / Gemini CLI（v2/v3）
- Claude Code plugin 形态（v3）
- Linux toast（远程通道在 Linux 可用即可）
