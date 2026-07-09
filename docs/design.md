# 手机推送功能设计（面向可分发给他人使用）

## 设计原则

1. **零服务器**：作者不自建推送服务，否则有运维成本、隐私责任，且用户会担心代码内容经过第三方。
2. **零编程门槛**：目标用户是「用 AI CLI 的人」，会装 npm 包，但不该要求他们写脚本、申请 API key 走复杂流程。
3. **默认不打扰**：手机推送只在「真的需要人」时发生，否则用户装一天就卸载。

## 一、推送通道：多通道适配器，不绑定单一服务

自己做推送 App 成本极高（iOS 上架、APNs、保活），正确做法是**借力现成推送 App**，工具只负责发 HTTP 请求。做成 provider 适配器架构：

| 通道 | 用户侧成本 | 适合人群 | 接入方式 |
|------|-----------|---------|---------|
| **企业微信群机器人**（国内默认三选一） | 建群 → 添加机器人 → 复制 webhook，约 1 分钟 | 用企微办公的用户 | webhook POST，无需签名 |
| **钉钉自定义机器人**（国内默认三选一） | 建群 → 添加自定义机器人 → 选安全方式 → 复制 webhook | 用钉钉办公的用户 | webhook POST，需加签或关键词 |
| **飞书自定义机器人**（国内默认三选一） | 建群 → 添加自定义机器人 → 复制 webhook | 用飞书办公的用户 | webhook POST，签名可选 |
| **Slack Incoming Webhook**（海外默认三选一） | 建 workspace app → 复制 webhook | 用 Slack 办公的用户 | webhook POST |
| **Discord Webhook**（海外默认三选一） | 频道设置 → 整合 → 建 webhook | 开发者社区用户 | webhook POST |
| **ntfy.sh**（海外默认三选一） | 装 App、订阅一个 topic，无需注册 | 国际用户，Android/iOS | `POST https://ntfy.sh/{topic}` |
| **Bark** | 装 App 得到 device key | iOS + 中国用户 | `GET https://api.day.app/{key}/{msg}` |
| **Server酱** | 微信扫码获取 SendKey，通知直达个人微信 | 坚持要推到微信的用户 | POST，免费 ~5 条/天 |
| **Telegram Bot** | @BotFather 建 bot | 海外用户 | Bot API |
| **通用 Webhook** | 自备 | 高级用户/自托管 ntfy | 任意 POST |

### 国内主通道决策（2026-07-08 更新）：企微 / 钉钉 / 飞书 群机器人

理由：办公人群几乎必装三者之一；三家机器人全部**免费、零服务器、无需企业认证、无需审核**，
额度约 20 条/分钟远超需求；手机 App 群消息自带实时推送。相比之下 Server酱 免费仅 ~5 条/天、
自营服务号要认证+服务器+合规风险，故降级为可选通道。

三家接入细节（都是发一个 HTTP POST，实现成本极低）：

- **企业微信**：`POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`，
  body `{"msgtype":"markdown","markdown":{"content":"..."}}`。无签名，最简单。
- **钉钉**：`POST https://oapi.dingtalk.com/robot/send?access_token=xxx`。安全设置必选其一：
  推荐「加签」（timestamp + HMAC-SHA256）；或让用户选「自定义关键词」并把关键词（如"通知"）固定进消息标题——setup 向导两种都支持。
- **飞书**：`POST https://open.feishu.cn/open-apis/bot/v2/hook/xxx`，
  body `{"msg_type":"interactive","card":{...}}` 可做漂亮的卡片（标题色区分 完成/等待授权），签名可选。

共同注意事项：机器人消息发在**群**里，setup 向导要引导用户「建一个只有自己的小群」（企微/钉钉/飞书均可先拉人再踢或直接单人群），并提醒别把该群设为免打扰，否则手机收不到横幅。

### 个人微信通道（可选，已非主路径）

> 2026-07-08 决策：主通道改为上面的企微/钉钉/飞书机器人。以下方案仅供「一定要推到个人微信」的用户参考。

微信不开放个人推送 API，所有方案本质都是「借公众号/服务号的模板消息通道」。可选路径按推荐排序：

1. **Server酱 Turbo**（首选默认）：用户微信扫码 → 得到 SendKey → 通知以服务号消息直达微信。知名度最高、接入最简单。免费版每天约 5 条——看似少，但正好配合本工具「只在关键时刻推」的策略（人不在电脑前 + 长任务/等授权才推），一般够用；重度用户可付费或换通道。
2. **WxPusher**：同样走公众号，免费额度宽松（适合推送量大的用户），扫码建应用拿 appToken + 关注公众号即可。作为 Server酱 免费额度不够时的替补默认。
3. **企业微信自建应用 + 微信插件**：消息可直达微信（通过企微的微信插件），免费无限量；但要注册企业微信、建应用、配可信 IP/域名，对普通用户门槛太高，只作为文档里的高级选项，不做默认。注意：企微**群机器人** webhook 的消息只在企微 App 内可见、到不了微信，两者别混淆。
4. **微信公众平台测试号**：免费无限、无需认证，但要用户自己去申请测试号并扫码关注，体验最差，仅文档提及。
5. **自营认证服务号**（远期变现路径，见里程碑）：用户扫我们的码即绑定，体验最好，但需要认证服务号 + 服务器，与「零服务器」原则冲突，留到有用户量之后。

setup 向导中，检测到系统语言为中文时默认引导 Server酱，否则引导 ntfy。

要点：
- 每个 provider 只是一个「config 字段 + 一个发送函数」，加新通道边际成本极低，也方便社区 PR。
- ntfy 默认用随机生成的 topic（如 `agent-notify-x7f3k9q2`），避免公共 topic 被人猜到收到别人的通知。
- **隐私默认安全**：推送内容默认只含「来源 + 项目名 + 事件 + 耗时」，不带对话/代码内容；`include_summary: true` 才附带最后一条消息摘要。这是别人敢用的前提。

## 二、触发策略：什么时候才推手机

全推 = 骚扰。核心逻辑是「**人在电脑前只弹 toast，人不在才推手机**」：

```
事件到达
 ├─ 事件 = 等待授权/输入（Notification hook）→ toast + 手机都推（卡住等人是最高优先级）
 └─ 事件 = 任务完成（Stop / agent-turn-complete）
      ├─ 任务时长 < 阈值（默认 45s）→ 只弹 toast（短任务人多半还盯着屏幕）
      ├─ 用户在电脑前（Windows GetLastInputInfo 空闲 < 2min 且未锁屏）→ 只弹 toast
      └─ 否则 → toast + 手机推送
```

- 阈值、空闲判定、免打扰时段（quiet hours）全部可配置。
- 任务时长来源：Claude Code 用 `UserPromptSubmit` hook 记开始时间戳（写临时文件），`Stop` 时相减；Codex 的 JSON 里带 turn 信息。
- 防轰炸：同一会话 60s 内多个事件合并为一条。

## 三、消息格式

```
[Claude Code] ✅ 任务完成 · stock-widget
耗时 4m32s · 「已修复悬浮窗置顶失效问题，构建通过」
```

```
[Codex] ⏸ 等待你确认 · duoban
已等待 30s，需要授权执行命令
```

- 标题：来源 + 事件图标 + 项目名（取工作目录 basename）
- 正文：耗时 + 可选摘要
- ntfy/Bark 支持优先级和声音：「等待输入」用高优先级+持续提示音，「完成」用普通优先级。

## 四、架构与安装形态

```
~/.agent-notify/config.json        ← 用户配置（通道、阈值、quiet hours）
agent-notify（单入口 CLI）
 ├─ init    自动检测并写入 Claude Code settings.json hooks + Codex config.toml
 ├─ send    被 hook 调用：读 stdin JSON → 判定策略 → toast / 推手机
 ├─ setup   交互式向导：选通道 → 引导装 App → 发测试推送验证
 └─ test    手动发一条测试通知
```

**分发三形态（按优先级）：**

1. **npm 包**：`npm i -g agent-notify && agent-notify setup`。一个包覆盖 Win/mac/Linux，且 Claude Code / Codex 用户 100% 有 Node。toast 用 `node-notifier`（跨平台）。
2. **Claude Code 官方 plugin**：plugin 可以打包 hooks，用户 `/plugin install` 一键装好 Claude 侧（内部仍调用同一个 CLI）。这是获客入口——plugin marketplace 是精准流量。
3. **Go 单二进制**（后期可选）：无 Node 依赖、启动快（hook 每次任务结束都会调用，Node 冷启动 ~200ms 可接受但不完美）。

**setup 向导是成败关键**：别人能不能用起来，取决于配通道是不是 3 分钟内完成。流程：选通道 → 显示对应 App 二维码/下载链接 → 用户填 key/自动生成 topic → 立刻发测试推送 → 收到即成功。

## 五、里程碑（2026-07-08 按开源定位修订）

- **v1（开源首发即全球可用）**：npm 包（MIT），`init`/`send`/`test`/`uninstall`；通道：企微 + 钉钉 + 飞书 + Slack + Discord + ntfy（全是一个 POST，一起做）；本机 toast 支持 Windows + macOS；触发策略只做时长阈值；README 英文为主 + 中文版；GitHub Actions CI + provider 层 mock 单测。自己先用一周再发。
- **v2**：`setup` 向导、空闲检测（Win: GetLastInputInfo；macOS: `ioreg` HIDIdleTime；Linux: xprintidle，检测不可用则优雅降级为"总是推"）、quiet hours、Bark/Server酱/Telegram、事件合并。
- **v3**：发布 Claude Code 官方 plugin（plugin 自带 hooks，不再改用户 settings.json）、Gemini CLI 支持。
- **远期（可选变现）**：微信服务号「扫码即绑定」通道 —— 免装 App、体验最好，但需要认证服务号 + 服务器，等开源版有用户量再说。

## 六、竞品差异（开源定位）

code-notify（本机 + Slack/Discord）等已存在，"多通道"本身不是差异。本项目的三个护城河，README 第一屏按此写：

1. **在场检测智能路由**：人在电脑前只弹 toast，人离开才推手机/IM——竞品都是无脑全推；
2. **国内办公 IM 通道**：企微/钉钉/飞书，竞品全部没有，覆盖中文开发者刚需；
3. **一条命令配好 Claude Code + Codex 两家**。

名字候选：`agent-notify` / `afk-agent` / `pingme-cli`（开工前查 npm 占用）。

## 七、开源工程注意事项

- **`init` 合并 hooks 必须幂等且可逆**：用户 `~/.claude/settings.json` 可能已有其他 hooks，只能追加自己的条目（带可识别标记），重复运行不重复添加，`uninstall` 精确移除。这是开源后 issue 最多的地方，v1 就要做对。
- **功能矩阵如实标注不对称**：「等待授权提醒」仅 Claude Code 有事件（Notification hook）；Codex 目前只有 `agent-turn-complete`，做不了等授权提醒。
- **并发会话**：时长统计的状态文件按 hook JSON 里的 `session_id` 键控，避免多终端互相污染。
- **密钥安全**：webhook/key 明文存 `~/.agent-notify/config.json`（同 `.npmrc` 惯例），文档说明 + 创建时收紧文件权限；日志/错误信息不得回显完整 webhook URL。
- **可测试性**：provider 全部走统一接口便于 mock；提供 `--dry-run` 打印将发送的内容而不真发。
