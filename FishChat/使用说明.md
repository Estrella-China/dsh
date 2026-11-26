# FishChat

一个轻量的 QQ 风格桌面聊天软件：只和你自己的机器人聊天。
不需要加好友、不需要注册服务器，装好就能用，机器人用任何语言写都可以。

![QQ 风格界面](https://img.shields.io/badge/UI-QQ%E9%A3%8E%E6%A0%BC-0091ff) ![Electron](https://img.shields.io/badge/Electron-45.x-47848F) ![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)

## 功能

- 左侧机器人列表：在线状态、未读红点、最后一条消息预览、搜索
- 聊天窗口：文字消息、时间分隔线、消息气泡（自己右侧蓝色、机器人左侧白色）
- 自定义头像：点 🎭 换当前机器人头像、点 👤 换自己的头像；头像保存在本地，重装不丢
- 表情：内置 60 个表情
- 表情包：内置 12 个专属 SVG 表情包（开心、大笑、委屈、流泪、生气、惊讶、害羞、疑问、加油、晚安、666、收到）
- 文件与图片：按钮选择、拖拽、粘贴均可；图片直接显示，文件卡片可点击用系统程序打开
- **语音消息**：点 🎤 录制，点一下停止自动生成语音气泡，点 ▶ 播放；机器人也能收发语音（`.ogg`/`.mp3`/`.wav`/`.webm`）
- 本地消息记录：保存在 `%APPDATA%\FishChat`，重启不丢
- 深色 / 浅色主题切换
- 机器人离线时消息自动保存，机器人上线后自动补发

## 快速开始（开发模式）

需要 Node.js 18+：

```bash
pnpm install        # 或 npm install
pnpm start          # 启动桌面端
```

> 如果 `pnpm install` 提示 `Ignored build scripts: electron`，执行 `pnpm approve-builds` 勾选 electron 再重新 install（或 `npm config set ignore-scripts false` 后用 npm 安装）。Electron 首次需要下载约 150MB 的运行时，国内网络慢的话可以先设置镜像：
>
> ```powershell
> $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
> ```

第一次运行会自动创建数据目录。启动后：

1. 打开 FishChat，界面会显示机器人接入端口（默认 `3210`，被占用会自动 +1）
2. 运行示例机器人：
   ```bash
   pip install websockets
   python bot/bot_example.py
   ```
3. 机器人「小Q」会出现在左侧列表，点开就能聊天
4. 试试发表情、表情包、图片、文件；机器人离线后发消息，再启动机器人会自动补发

## 打包成 Windows 安装包

```bash
pnpm dist
```

产物在 `dist/` 目录：`FishChat Setup <版本号>.exe`（NSIS 安装包，可自选安装目录、创建桌面快捷方式）。
国内网络建议先设置镜像再安装依赖：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm install
pnpm dist
```

## 机器人接入协议

机器人通过 WebSocket 连接 FishChat 在本机开的端口（默认 `ws://127.0.0.1:3210`），
连上后 5 秒内必须发送 `hello`，否则会被断开。同一个名字重复连接会顶掉旧连接。

| 方向 | 消息 | 说明 |
| --- | --- | --- |
| 机器人 → FishChat | `{"type":"hello","name":"小Q"}` | 握手，5 秒内发送 |
| FishChat → 机器人 | `{"type":"hello-ok","botId":"小Q","protocol":1}` | 握手成功 |
| FishChat → 机器人 | `{"type":"message","id":"...","text":"你好","attachments":[...]}` | 用户发来的消息 |
| 机器人 → FishChat | `{"type":"reply","text":"你好呀","attachments":[...]}` | 回复用户 |
| 机器人 → FishChat | `{"type":"message","text":"我到点提醒你一下"}` | 主动说话（不需回复对象） |
| 机器人 → FishChat | `{"type":"typing"}` | 显示「对方正在输入…」 |

附件格式（双向一致），`data` 为 base64，`type` 可以是 `image` / `file` / `voice`，语音额外带 `duration`（毫秒）：

```json
{"type": "image", "name": "a.png", "size": 12345, "data": "<base64>"}
{"type": "voice", "name": "v.ogg", "size": 2345, "duration": 3200, "data": "<base64>"}
```

单附件上限 20MB。机器人重连后，FishChat 会先把离线期间未送达的用户消息补发一遍。

示例机器人见 `bot/bot_example.py`，把 `brain()` 换成你的逻辑（例如调用大模型）即可。

## 数据位置

- `%APPDATA%\FishChat\data.json`：机器人列表 + 消息记录
- `%APPDATA%\FishChat\files\`：所有收发的图片和文件

界面右上角 📂 按钮可以直接打开这个目录。

## 测试

```bash
pnpm test    # 协议测试 + 存储测试
```

## 常见问题

**Q：机器人连不上？**
A：看界面右上角的端口号，机器人脚本里的端口要一致；先启动 FishChat 再启动机器人。

**Q：发文件提示超过 20MB？**
A：单附件限制 20MB（base64 传输），大文件建议传文件链接。

**Q：录语音没反应 / 提示无法使用麦克风？**
A：检查 Windows 设置 → 隐私 → 麦克风，允许桌面应用访问麦克风；另外确认系统里有可用的录音设备。

**Q：换电脑后聊天记录没了？**
A：记录存在本机 `%APPDATA%\FishChat`，换电脑不会自动同步。

**Q：能同时开两个 FishChat 吗？**
A：端口会自动 +1 规避冲突，但两个实例各自独立存储，不建议同时用。
