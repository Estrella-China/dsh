# 贡献指南

## 开发环境

- Windows 10 / 11
- Node.js 22+
- pnpm 9+

```bash
pnpm install
pnpm start
```

## 提交前检查

```bash
pnpm test
```

- 不要提交 `node_modules`、`dist`、`.eb-cache`
- 不要提交 `bridge.log`、`%APPDATA%\FishChat` 里的聊天记录
- 不要提交 API Key、真实 QQ 号、个人路径
- 新增机器人功能时，同步更新 `使用说明.md` 里的协议说明

## 代码风格

- 原生 JavaScript，不引入不必要的前端框架
- 机器人协议保持向后兼容
- 附件仍然走 base64，单文件上限 20MB
- 不要默认监听 `0.0.0.0`，机器人端口只给本机用

## Pull Request

1. 说明改了什么、为什么改
2. 截图或录屏展示 UI 变化
3. 确认没有把本地数据带进提交
