# FishChat

一个轻量的 QQ 风格桌面聊天客户端，专门用来自定义机器人，或者接入 DSH 里的 Aurabot。

- Electron 45
- Local-first：聊天记录和文件只保存在本机
- 机器人协议简单：本机 WebSocket + JSON
- 支持文字、表情、表情包、图片、文件、语音
- 支持 DSH / Aurabot（大肥鱼）

## 功能

- 左侧机器人列表：在线状态、未读红点、最后一条消息、搜索
- 聊天窗口：文字、时间分隔线、左右气泡
- 头像：机器人和自己的头像都可以换
- 表情：内置表情和 12 个 SVG 表情包
- 图片 / 文件：按钮选择、拖拽、粘贴
- 语音：录制、播放，机器人也能收发
- 本地消息记录，重启不丢
- 机器人离线时消息暂存，上线后补发
- 深色 / 浅色主题

## 技术栈

- Electron `^45.3.1`
- Node.js 22+
- `ws`（机器人 WebSocket）
- 原生 HTML / CSS / JavaScript，无前端框架

## 快速开始

```bash
pnpm install
pnpm start
```

如果 `pnpm install` 提示 Electron 构建脚本被忽略：

```bash
pnpm approve-builds
pnpm install
```

国内网络可以先设置镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

## 目录结构

```text
FishChat/
├─ main.js                 Electron 主进程
├─ preload.js              预加载脚本
├─ src/
│  ├─ server.js            机器人 WebSocket 服务
│  ├─ store.js             本地数据
│  └─ files.js             附件处理
├─ renderer/               聊天界面
├─ bot/
│  └─ bot_example.py       最小 Python 机器人
├─ bridge/
│  └─ bridge.js            QChat ⇄ OneBot 桥
├─ scripts/                图标 / 表情包等开发脚本
├─ test/                   协议与存储测试
├─ assets/                 图标资源
├─ package.json
└─ pnpm-lock.yaml
```

## 机器人接入

FishChat 启动后监听：

```text
ws://127.0.0.1:3210
```

机器人连上后 5 秒内发送：

```json
{"type":"hello","name":"小Q"}
```

收消息：

```json
{"type":"message","text":"你好","attachments":[]}
```

回复：

```json
{"type":"reply","text":"你好呀","attachments":[]}
```

完整协议、附件格式和 DSH/Aurabot 接入方法见 [使用说明](使用说明.md)。

## 接入 DSH / Aurabot

FishChat 自带 OneBot 桥，默认：

```text
HTTP  http://127.0.0.1:5800
WS    ws://127.0.0.1:5800
```

Aurabot 里填：

```text
机器人 QQ：38890000
主人 QQ：38890001
```

详细配置见 [使用说明](使用说明.md)。

## 数据与隐私

- 聊天记录：`%APPDATA%\FishChat\data.json`
- 图片 / 文件：`%APPDATA%\FishChat\files\`
- 仓库不包含用户数据、聊天日志、API Key
- 不要把 `bridge.log`、`%APPDATA%\FishChat` 提交到仓库

## 构建

```bash
pnpm dist
```

Windows 安装包输出到：

```text
dist/FishChat Setup <version>.exe
```

发布流程见 [RELEASE.md](RELEASE.md)。

## 测试

```bash
pnpm test
```

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT，见 [LICENSE](LICENSE)。
