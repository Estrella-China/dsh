# FishChat Release

版本：0.5.9

## 1. 构建

```bash
pnpm install
pnpm test
pnpm dist
```

产物：

```text
dist/FishChat Setup 0.5.9.exe
dist/win-unpacked/
```

## 2. 发布包结构

面向用户的安装包可以直接发：

```text
FishChat Setup 0.5.9.exe
```

如果发绿色版，必须保留完整目录：

```text
FishChat/
├─ FishChat.exe
├─ resources/
├─ locales/
├─ *.pak
├─ *.dll
└─ *.bin
```

只发 `FishChat.exe` 会打不开或白屏。

## 3. 发布前隐私检查

必须确认没有打包：

```text
resources/bridge/bridge.log
%APPDATA%/FishChat/data.json
%APPDATA%/FishChat/files/
```

检查项：

- 没有 `bridge.log`
- 没有聊天记录 / 图片 / 语音
- 没有 API Key、token、私钥
- 没有真实 QQ 号、个人路径
- `bridge.js` 里的 `38890000` / `38890001` 是假号，可以公开

## 4. 源码发布

开源仓库应包含：

- `main.js`、`preload.js`
- `src/`、`renderer/`
- `bot/`、`bridge/`
- `package.json`、`pnpm-lock.yaml`
- `README.md`、`使用说明.md`、`LICENSE`
- `.gitignore`

不要提交 `node_modules`、`dist`、`.eb-cache`、日志和用户数据。

## 5. GitHub Release

建议每个版本附：

- `FishChat Setup <version>.exe`
- `使用说明.md`
- `RELEASE.md`
- SHA256

安装包没有代码签名，Windows SmartScreen 可能提示「未知发布者」。

## 6. 版本检查清单

- [ ] 版本号已更新
- [ ] `pnpm test` 通过
- [ ] 安装包 / 绿色版目录完整
- [ ] 没有 `bridge.log` 和用户数据
- [ ] 没有 API Key、真实 QQ 号、个人路径
- [ ] 3210 / 5800 只监听本机
- [ ] README、使用说明、LICENSE 已更新
