# QChat ⇄ OneBot v11 桥

让 **Aurabot（大肥鱼）** 以为自己在连一个 QQ 网关（OneBot v11），实际上连的是 **QChat**。

```
Aurabot（人格/记忆/心情）──OneBot v11 协议──> 本桥 ──QChat 机器人协议──> QChat
```

## 工作原理

- 本桥在本机 `5800` 端口开一个 **OneBot v11 服务**（HTTP API + 正向 WS 事件）
- Aurabot 面板里把网关选成「已有 OneBot」，地址填 `http://127.0.0.1:5800` 和 `ws://127.0.0.1:5800`
- 本桥同时作为机器人连上 QChat（默认 `ws://127.0.0.1:3210`），机器人名 `大肥鱼`
- QChat 里你发的消息 → 变成 OneBot 私聊事件 → Aurabot 处理（人格+记忆）→ 回复 → 本桥转成 QChat 消息
- Aurabot 发表情包/语音 → 转成 QChat 的图片/语音消息

> 注意：QChat 里你的身份是假 QQ 号 `38890001`，机器人大肥鱼是 `38890000`。
> Aurabot 配置里把 `botQQ` 填 `38890000`、`ownerQQ` 填 `38890001`，她才会把你当主人。

## 启动

**方式一（推荐，静默后台）**：双击桌面 **「启动QChat桥」** 快捷方式（或本目录 `静默启动.vbs`）。
无黑窗口，桥在后台运行；日志写到 `bridge.log`。

**方式二（有窗口，便于观察）**：双击 `启动桥.bat`。

**停止**：双击桌面 **「停止QChat桥」** 快捷方式（或 `停止桥.vbs`）。

**方式三**：命令行

```bat
cd /d D:\Aurabot\qchat-bridge
D:\nodejs\node.exe bridge.js
```

> ❗ 不要双击 `bridge.js` 本身！Windows 会用系统自带的脚本引擎（WSH）打开它，报「第 19 行语法错误 / 800A03EA」。
> 一定要用上面的快捷方式或 .bat 启动。

看到这两行就说明成功：

```
[bridge] OneBot v11 服务已启动：HTTP http://127.0.0.1:5800  WS ws://127.0.0.1:5800
[qchat] 握手成功，机器人名：大肥鱼
```

使用期间**桥和 QChat 都要开着**；关掉桥 Aurabot 就收不到 QChat 消息了。

## 可调参数（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `QCHAT_URL` | `ws://127.0.0.1:3210` | QChat 机器人端口 |
| `BOT_NAME` | `大肥鱼` | QChat 里显示的机器人名 |
| `ONEBOT_PORT` | `5800` | OneBot 服务端口 |
| `SELF_ID` | `38890000` | 机器人假 QQ 号 |
| `OWNER_ID` | `38890001` | 主人假 QQ 号 |
| `OWNER_NAME` | `主人` | 你的昵称 |
| `TOKEN` | 空 | OneBot access_token，留空不校验 |

## 支持 / 不支持

- ✅ 私聊文字、表情包（图片）、语音（record）、文件卡片
- ✅ Aurabot 主动找你（send_private_msg 等主动消息）
- ⚠️ 群聊、QQ 空间、B 站、抖音、翻唱等依赖真实 QQ 的功能：QChat 桥不支持，调用会返回失败（Aurabot 会记日志，不影响私聊）
- ⚠️ 语音转文字：QChat 的语音到了 Aurabot 那边，需要它自己的 ASR 才会转文字（本地 ASR 默认关）；纯文字聊天不受影响

## 排错

看日志：`D:\Aurabot\qchat-bridge\bridge.log`

- `QChat 未连接`：QChat 没开，或端口不是 3210
- Aurabot 面板显示离线：检查网关地址是否填 `5800`，以及本桥是否在运行
- 收到消息但没回复：看 Aurabot 面板日志（模型没配好、试运行没关等）
