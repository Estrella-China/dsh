'use strict';

const { app, BrowserWindow, ipcMain, protocol, shell, Menu, session, Notification, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { ChatHub } = require('./src/server');
const { Store } = require('./src/store');
const { saveAttachment, readAttachmentBase64, attachmentPath, mimeOf } = require('./src/files');

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 单附件上限 20MB

app.setName('FishChat');
// Windows 通知归属：让系统把通知显示成 FishChat（而不是宿主或默认 Electron）
app.setAppUserModelId('com.fishchat.app');

// 单实例：再次打开时聚焦已有窗口（后台运行时点桌面图标也能唤回）
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    try {
      showWindow();
    } catch (_) {}
  });
}

let win = null;
let store = null;
let hub = null;
let filesDir = '';
let tray = null;
let isQuitting = false;
let trayHintShown = false;
let splash = null;
let mainReady = false;
let splashDone = false;
const isSmoke = process.argv.includes('--smoke');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'qfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function showWindow() {
  if (!win || win.isDestroyed()) return;
  win.show();
  win.focus();
  if (win.isMinimized()) win.restore();
}

function maybeShowMainWindow() {
  if (!win || win.isDestroyed()) return;
  if (!mainReady || !splashDone) return;
  win.show();
  win.focus();
}

function createSplash() {
  if (isSmoke) {
    splashDone = true;
    return;
  }

  splash = new BrowserWindow({
    width: 440,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splash.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) splash.show();
  });

  const finish = () => {
    if (!splash || splash.isDestroyed()) {
      splashDone = true;
      maybeShowMainWindow();
      return;
    }
    let opacity = 1;
    const timer = setInterval(() => {
      if (!splash || splash.isDestroyed()) {
        clearInterval(timer);
        splashDone = true;
        maybeShowMainWindow();
        return;
      }
      opacity -= 0.12;
      if (opacity <= 0) {
        clearInterval(timer);
        try {
          splash.hide();
          splash.destroy();
        } catch (_) {}
        splash = null;
        splashDone = true;
        maybeShowMainWindow();
      } else {
        try {
          splash.setOpacity(opacity);
        } catch (_) {}
      }
    }, 30);
  };

  // 入场动画约 1.5 秒，再淡出。
  setTimeout(finish, 1600);

  // 兜底：splash 加载失败或卡住时，不能让主窗口一直藏着。
  setTimeout(() => {
    if (splashDone) return;
    try {
      if (splash && !splash.isDestroyed()) splash.destroy();
    } catch (_) {}
    splash = null;
    splashDone = true;
    maybeShowMainWindow();
  }, 5000);

  splash.on('closed', () => {
    splash = null;
    if (!splashDone) {
      splashDone = true;
      maybeShowMainWindow();
    }
  });
}

function createTray() {
  try {
    if (tray) return;
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
    tray = new Tray(icon);
    tray.setToolTip('FishChat（在后台运行）');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 FishChat', click: () => showWindow() },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ])
    );
    tray.on('click', () => showWindow());
  } catch (err) {
    console.error('[tray] 创建托盘失败：', err);
  }
}

function notifyTrayHint() {
  if (trayHintShown) return;
  trayHintShown = true;
  if (store && store.data.meta.notify === false) return;
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: 'FishChat 仍在后台运行',
      body: '已最小化到托盘，桥不会断开；点托盘图标可重新打开',
      icon: path.join(__dirname, 'assets', 'icon.png'),
    });
    n.on('click', () => showWindow());
    n.show();
  } catch (_) {
    /* ignore */
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    title: 'FishChat',
    backgroundColor: '#f2f3f5',
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    mainReady = true;
    maybeShowMainWindow();
  });

  // 关闭窗口：默认收进托盘继续后台运行（设置里可关掉）
  win.on('close', (e) => {
    if (isQuitting) return;
    if (store && store.data.meta.closeToTray !== false) {
      e.preventDefault();
      win.hide();
      notifyTrayHint();
    }
  });

  if (isSmoke) {
    win.webContents.on('console-message', (_e, ...args) => {
      console.log('CONSOLE', JSON.stringify(args));
    });
    win.webContents.on('preload-error', (_e, p, err) => console.error('PRELOAD_ERROR', p, err));
    win.webContents.on('render-process-gone', (_e, details) =>
      console.error('RENDER_GONE', details)
    );
  }

  if (isSmoke) {
    setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage();
        const out = path.join(app.getPath('temp'), 'fishchat-smoke.png');
        fs.writeFileSync(out, image.toPNG());
        console.log('SMOKE_SCREENSHOT', out);
      } catch (err) {
        console.error('SMOKE_ERROR', err);
      } finally {
        app.quit();
      }
    }, 5000);
  }
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      type: a.type === 'image' ? 'image' : a.type === 'voice' ? 'voice' : 'file',
      name: typeof a.name === 'string' ? a.name : 'file',
      size: Number(a.size) || 0,
      duration: Number(a.duration) || 0,
      data: typeof a.data === 'string' ? a.data : '',
    }))
    .filter((a) => a.data.length > 0);
}

function saveIncomingAttachments(botName, attachments) {
  const saved = [];
  for (const att of attachments) {
    let data = att.data;
    if (Buffer.byteLength(data, 'base64') > MAX_ATTACHMENT_BYTES) continue;
    const file = saveAttachment(filesDir, data, att.name);
    saved.push({ type: att.type, name: att.name, size: att.size, duration: att.duration || 0, file });
  }
  return saved;
}

function forwardToRenderer(event) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('chat-event', event);
  }
}

function notifyNewMessage(fromName, text, attachments) {
  try {
    if (store && store.data.meta.notify === false) return; // 设置里关了通知
    if (!Notification.isSupported()) return;
    if (win && win.isFocused()) return; // 窗口在前台就不打扰
    const body = (text || '').trim() || (attachments && attachments.length ? '[附件]' : '新消息');
    const alias = store.data.meta.aliases && store.data.meta.aliases[fromName];
    const n = new Notification({
      title: alias || fromName || 'FishChat',
      body: body.slice(0, 120),
      icon: path.join(__dirname, 'assets', 'icon.png'),
      silent: false,
    });
    n.on('click', () => {
      if (!win || win.isDestroyed()) return;
      win.show();
      win.focus();
      win.webContents.send('chat-event', { type: 'select-bot', name: fromName });
    });
    n.show();
  } catch (err) {
    console.error('[notify] failed:', err);
  }
}

function wireHubEvents() {
  hub.onEvent = (event) => {
    switch (event.type) {
      case 'bot-online': {
        store.setBotOnline(event.name, true);
        forwardToRenderer({ type: 'bot-online', name: event.name });
        // 重连后补发未送达的用户消息
        const backlog = store.undelivered(event.name);
        for (const msg of backlog) {
          const attachments = (msg.attachments || [])
            .map((att) => {
              const data = readAttachmentBase64(filesDir, att.file);
              return data
                ? { type: att.type, name: att.name, size: att.size, duration: att.duration || 0, data }
                : null;
            })
            .filter(Boolean);
          const ok = hub.sendToBot(event.name, {
            type: 'message',
            id: msg.id,
            text: msg.text,
            attachments,
          });
          if (ok) store.markDelivered(event.name, msg.id);
        }
        break;
      }
      case 'bot-offline':
        store.setBotOnline(event.name, false);
        forwardToRenderer({ type: 'bot-offline', name: event.name });
        break;
      case 'bots':
        forwardToRenderer({ type: 'bots', bots: event.bots });
        break;
      case 'bot-message': {
        const savedAttachments = saveIncomingAttachments(
          event.name,
          normalizeAttachments(event.attachments)
        );
        const message = {
          id: newId(),
          from: 'bot',
          text: typeof event.text === 'string' ? event.text : '',
          attachments: savedAttachments,
          time: Date.now(),
          delivered: true,
        };
        store.addMessage(event.name, message);
        forwardToRenderer({ type: 'message', botName: event.name, message });
        notifyNewMessage(event.name, message.text, message.attachments);
        break;
      }
      case 'bot-typing':
        forwardToRenderer({ type: 'bot-typing', name: event.name });
        break;
      default:
        break;
    }
  };
}

function logError(tag, err) {
  try {
    const line = `[${new Date().toISOString()}] [${tag}] ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), line);
  } catch (_) {
    /* ignore */
  }
}

function applyAutoStart(enabled) {  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
    console.log('[autostart] openAtLogin =', !!enabled);
  } catch (err) {
    console.error('[autostart] 设置失败：', err);
  }
}

function registerIpc() {
  ipcMain.handle('init', () => {
    const storedBots = store.bots();
    const online = new Set(hub.list().map((b) => b.name));
    const bots = storedBots.map((b) => ({ ...b, online: online.has(b.name) }));
    for (const name of online) {
      if (!bots.some((b) => b.name === name)) {
        bots.push({ name, online: true, lastSeen: Date.now() });
      }
    }
    return {
      port: hub.port,
      bots,
      messages: store.data.messages,
      activeBot: store.data.meta.activeBot || null,
      avatars: store.data.meta.avatars || {},
      aliases: store.data.meta.aliases || {},
      userDataPath: app.getPath('userData'),
    };
  });

  ipcMain.handle('set-alias', (_e, payload) => {
    const { name, alias } = payload || {};
    if (typeof name !== 'string' || !name) throw new Error('缺少机器人名称');
    if (!store.data.meta.aliases) store.data.meta.aliases = {};
    const clean = typeof alias === 'string' ? alias.trim().slice(0, 20) : '';
    if (clean) store.data.meta.aliases[name] = clean;
    else delete store.data.meta.aliases[name];
    store.save();
    return { name, alias: clean || null };
  });

  ipcMain.handle('set-avatar', async (_e, payload) => {
    const { target, name, data, ext } = payload || {};
    if (target !== 'bot' && target !== 'user') throw new Error('头像目标不正确');
    const key = target === 'user' ? 'user' : `bot:${String(name || '')}`;
    if (data == null) {
      if (store.data.meta.avatars) {
        delete store.data.meta.avatars[key];
        store.save();
      }
      return { key, file: null };
    }
    if (typeof data !== 'string' || !data) throw new Error('头像数据为空');
    const safeExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(
      String(ext || '').toLowerCase()
    )
      ? String(ext).toLowerCase()
      : '.png';
    const file = saveAttachment(filesDir, data, `avatar-${Date.now()}${safeExt}`);
    if (!store.data.meta.avatars) store.data.meta.avatars = {};
    store.data.meta.avatars[key] = file;
    store.save();
    return { key, file };
  });

  ipcMain.handle('send', async (_e, payload) => {
    const { botName, text, attachments } = payload || {};
    if (typeof botName !== 'string' || !botName) {
      throw new Error('缺少机器人名称');
    }
    const cleanText = typeof text === 'string' ? text : '';
    const cleanAtts = normalizeAttachments(attachments).map((att) => {
      if (Buffer.byteLength(att.data, 'base64') > MAX_ATTACHMENT_BYTES) {
        throw new Error(`附件「${att.name}」超过 20MB 限制`);
      }
      return att;
    });
    if (!cleanText.trim() && cleanAtts.length === 0) {
      throw new Error('消息不能为空');
    }

    const saved = cleanAtts.map((att) => {
      const file = saveAttachment(filesDir, att.data, att.name);
      return { type: att.type, name: att.name, size: att.size || 0, duration: att.duration || 0, file };
    });

    const message = {
      id: newId(),
      from: 'user',
      text: cleanText,
      attachments: saved,
      time: Date.now(),
      delivered: false,
    };
    store.addMessage(botName, message);

    const delivered = hub.sendToBot(botName, {
      type: 'message',
      id: message.id,
      text: cleanText,
      attachments: cleanAtts,
    });
    if (delivered) {
      store.markDelivered(botName, message.id);
      message.delivered = true;
    }
    return { message };
  });

  ipcMain.handle('set-active', (_e, botName) => {
    store.data.meta.activeBot = typeof botName === 'string' ? botName : null;
    store.save();
    return true;
  });

  ipcMain.handle('open-file', async (_e, file) => {
    if (typeof file !== 'string' || !file) return;
    return shell.openPath(attachmentPath(filesDir, file));
  });

  ipcMain.handle('open-user-data', async () => {
    return shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('clear-chat', (_e, botName) => {
    if (typeof botName === 'string' && botName) {
      store.clearMessages(botName);
    }
    return true;
  });

  ipcMain.handle('read-sticker', async (_e, file) => {
    const name = path.basename(String(file || ''));
    const filePath = path.join(__dirname, 'renderer', 'stickers', name);
    if (!fs.existsSync(filePath)) throw new Error('表情包不存在');
    const data = fs.readFileSync(filePath).toString('base64');
    return { data, name: `sticker-${name}` };
  });

  ipcMain.handle('get-settings', () => {
    try {
      return {
        notify: store.data.meta.notify !== false,
        autoStart: store.data.meta.autoStart === true,
        closeToTray: store.data.meta.closeToTray !== false,
        version: app.getVersion(),
      };
    } catch (err) {
      logError('get-settings', err);
      throw err;
    }
  });

  ipcMain.handle('set-settings', (_e, patch) => {
    try {
      const p = patch || {};
      if (typeof p.notify === 'boolean') store.data.meta.notify = p.notify;
      if (typeof p.autoStart === 'boolean') {
        store.data.meta.autoStart = p.autoStart;
        applyAutoStart(p.autoStart);
      }
      if (typeof p.closeToTray === 'boolean') {
        store.data.meta.closeToTray = p.closeToTray;
        if (p.closeToTray) createTray();
        else if (tray) {
          try {
            tray.destroy();
          } catch (_) {}
          tray = null;
        }
      }
      store.save();
      return {
        notify: store.data.meta.notify !== false,
        autoStart: store.data.meta.autoStart === true,
        closeToTray: store.data.meta.closeToTray !== false,
      };
    } catch (err) {
      logError('set-settings', err);
      throw err;
    }
  });

  ipcMain.handle('quit', () => {
    app.quit();
  });
}

/* ---------- 自动启动 QChat ⇄ OneBot 桥 ---------- */
let bridgeProc = null;

function findBridge() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'bridge'));
  candidates.push('D:\\Aurabot\\qchat-bridge');
  for (const dir of candidates) {
    const script = path.join(dir, 'bridge.js');
    if (fs.existsSync(script)) return { dir, script };
  }
  return null;
}

function isPortOpen(port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch (_) {}
      resolve(ok);
    };
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.setTimeout(timeoutMs, () => finish(false));
  });
}

async function maybeStartBridge() {
  if (process.env.FISHCHAT_NO_BRIDGE === '1') return;
  try {
    const found = findBridge();
    if (!found) {
      console.log('[bridge] 跳过自动启动：未找到桥脚本');
      return;
    }
    if (await isPortOpen(5800)) {
      console.log('[bridge] 检测到桥已在运行（5800 已占用），跳过');
      return;
    }
    // 直接用 Electron 自带运行时当 Node 跑桥，不依赖用户另外装 Node
    bridgeProc = spawn(process.execPath, [found.script], {
      cwd: found.dir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        QCHAT_URL: `ws://127.0.0.1:${hub.port}`,
      },
    });
    bridgeProc.on('error', (err) => console.error('[bridge] 启动失败：', err));
    bridgeProc.unref();
    console.log('[bridge] 已自动启动，pid =', bridgeProc.pid, '位置 =', found.dir);
  } catch (err) {
    console.error('[bridge] 自动启动异常：', err);
  }
}

function stopBridge() {
  if (!bridgeProc) return;
  try {
    bridgeProc.kill();
    console.log('[bridge] 已随 FishChat 退出');
  } catch (_) {
    /* ignore */
  }
  bridgeProc = null;
}

function migrateLegacyUserData() {  // 从旧名字 QChat 的用户数据目录迁移到 FishChat（消息、头像、文件）
  try {
    const newDir = app.getPath('userData');
    if (path.basename(newDir) !== 'FishChat') return;
    const oldDir = path.join(path.dirname(newDir), 'QChat');
    if (fs.existsSync(path.join(newDir, 'data.json'))) return;
    if (!fs.existsSync(path.join(oldDir, 'data.json'))) return;
    fs.cpSync(oldDir, newDir, { recursive: true });
    console.log('[migrate] 已从旧目录迁移用户数据：', oldDir);
  } catch (err) {
    console.error('[migrate] 迁移用户数据失败：', err);
  }
}

async function init() {
  await app.whenReady();

  migrateLegacyUserData();

  if (isSmoke) {
    Menu.setApplicationMenu(null);
  }

  filesDir = path.join(app.getPath('userData'), 'files');
  store = new Store(path.join(app.getPath('userData'), 'data.json'));
  if (store.data.meta.autoStart === true) applyAutoStart(true);
  hub = new ChatHub();
  wireHubEvents();
  await hub.start(3210);

  await maybeStartBridge();

  // 允许麦克风（语音消息录制）
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'audioCapture';
  });

  protocol.handle('qfile', async (request) => {
    try {
      const url = new URL(request.url);
      const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const filePath = attachmentPath(filesDir, name);
      if (!filePath.startsWith(filesDir)) {
        return new Response('forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        headers: { 'content-type': mimeOf(filePath) },
      });
    } catch (_) {
      return new Response('not found', { status: 404 });
    }
  });

  registerIpc();
  createSplash();
  createWindow();
  if (store.data.meta.closeToTray !== false) createTray();

  app.on('window-all-closed', () => {
    if (isQuitting) {
      app.quit();
      return;
    }
    if (store && store.data.meta.closeToTray !== false) return; // 留在托盘
    app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (splash && !splash.isDestroyed()) {
      try {
        splash.destroy();
      } catch (_) {}
      splash = null;
    }
    if (tray) {
      try {
        tray.destroy();
      } catch (_) {}
      tray = null;
    }
    stopBridge();
    try {
      store.flush();
    } catch (_) {
      /* ignore */
    }
  });
}

init().catch((err) => {
  console.error('FATAL', err);
  app.quit();
});
