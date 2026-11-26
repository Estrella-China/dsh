'use strict';

/**
 * QChat ⇄ OneBot v11 桥
 * =====================
 * 作用：Aurabot（大肥鱼）以为自己在连一个 QQ 网关（OneBot v11），
 *       实际上这个"网关"是我们自己：另一边连着 QChat 的机器人 WS 端口。
 *
 *   Aurabot ──HTTP/WS(OneBot v11)──> 本桥 ──WS(QChat 机器人协议)──> QChat
 *
 * 用法（在 D:\Aurabot\qchat-bridge 下）：
 *   node bridge.js
 *
 * 环境变量（都有默认值）：
 *   QCHAT_URL       QChat 机器人地址        ws://127.0.0.1:3210
 *   BOT_NAME        在 QChat 里显示的机器人名  大肥鱼
 *   ONEBOT_PORT     OneBot 监听端口          5800
 *   SELF_ID         机器人 QQ 号（假的）       38890000
 *   OWNER_ID        主人 QQ 号（假的）         38890001
 *   OWNER_NAME      主人昵称                主人
 *   TOKEN           OneBot access_token（留空不校验）
 *   MESSAGE_FORMAT  array | string           array
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const LOG_FILE = path.join(__dirname, 'bridge.log');

const opts = {
  qchatUrl: process.env.QCHAT_URL || 'ws://127.0.0.1:3210',
  botName: process.env.BOT_NAME || '大肥鱼',
  port: Number(process.env.ONEBOT_PORT) || 5800,
  selfId: Number(process.env.SELF_ID) || 38890000,
  ownerId: Number(process.env.OWNER_ID) || 38890001,
  ownerName: process.env.OWNER_NAME || '主人',
  token: process.env.TOKEN || '',
  messageFormat: process.env.MESSAGE_FORMAT === 'string' ? 'string' : 'array',
};

function log(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}

/* ---------- 消息段处理 ---------- */

const CQ_RE = /\[CQ:([a-z_]+)((?:,[^\]]*)?)\]/g;

function unescapeCQ(s) {
  return String(s)
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#44;/g, ',')
    .replace(/&amp;/g, '&');
}

function parseCQString(raw) {
  const segs = [];
  let last = 0;
  let m;
  CQ_RE.lastIndex = 0;
  while ((m = CQ_RE.exec(raw)) !== null) {
    if (m.index > last) segs.push({ type: 'text', data: { text: raw.slice(last, m.index) } });
    const type = m[1];
    const data = {};
    for (const kv of (m[2] || '').split(',').slice(1)) {
      const eq = kv.indexOf('=');
      if (eq > 0) data[kv.slice(0, eq)] = unescapeCQ(kv.slice(eq + 1));
    }
    segs.push({ type, data });
    last = m.index + m[0].length;
  }
  if (last < raw.length) segs.push({ type: 'text', data: { text: raw.slice(last) } });
  return segs;
}

function segmentsOf(message) {
  if (Array.isArray(message)) return message;
  if (typeof message === 'string') return parseCQString(message);
  return [];
}

function rawTextOf(segs) {
  return segs
    .map((s) => (s.type === 'text' ? s.data.text || '' : ''))
    .join('')
    .trim();
}

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const AUDIO_EXT = ['.webm', '.ogg', '.oga', '.mp3', '.wav', '.m4a', '.opus', '.amr'];

function extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? String(name).slice(i).toLowerCase() : '';
}

/** 把 OneBot 段里的 file 字段解析成 Buffer（支持 base64://、file:///、http(s)://、本地路径）。 */
async function loadSegmentFile(data) {
  let file = data?.file;
  if (!file && data?.url) file = data.url;
  if (typeof file !== 'string' || !file) return null;
  if (file.startsWith('base64://')) return Buffer.from(file.slice(9), 'base64');
  if (file.startsWith('http://') || file.startsWith('https://')) {
    const r = await fetch(file);
    if (!r.ok) throw new Error(`下载文件失败 HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (file.startsWith('file://')) file = decodeURIComponent(file.slice(7));
  return fs.readFileSync(file);
}

/** OneBot 消息段 → QChat 回复 { text, attachments } */
async function toQChat(segs) {
  let text = '';
  const attachments = [];
  for (const seg of segs) {
    const type = seg.type;
    const data = seg.data || {};
    if (type === 'text') {
      text += data.text || '';
    } else if (type === 'image' || type === 'record' || type === 'file') {
      try {
        const buf = await loadSegmentFile(data);
        if (!buf) continue;
        const name = data.name || data.file_name || (type === 'record' ? 'voice' : 'file');
        const ext = extOf(name) || (type === 'record' ? '.wav' : '.png');
        const finalName = extOf(name) ? name : `${name}${ext}`;
        attachments.push({
          type: type === 'image' ? 'image' : type === 'record' ? 'voice' : 'file',
          name: finalName,
          size: buf.length,
          data: buf.toString('base64'),
        });
      } catch (err) {
        log('warn', `解析 ${type} 附件失败：${err.message}`);
        text += text ? '' : `[${type}]`;
      }
    } else if (type === 'face') {
      // QQ 表情数字 → 简单映射，失败就忽略
      text += '';
    } else if (type === 'at') {
      text += data.qq === 'all' ? '@全体成员 ' : '@' + (data.qq || '') + ' ';
    } else if (type === 'reply') {
      // 引用，QChat 不支持，忽略
    }
  }
  return { text: text.trim(), attachments };
}

/* ---------- QChat 侧 ---------- */

class QChatLink {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.retry = null;
    this.want = false; // 只有 Aurabot 接上桥时才为 true
    this.onEvent = null; // (onebotEvent) => void
  }

  /** 由 OneBot 客户端的连接数决定是否要连 QChat */
  setWanted(want) {
    want = !!want;
    if (want === this.want) return;
    this.want = want;
    if (want) {
      log('qchat', 'Aurabot 已连上桥，开始连接 QChat');
      if (!this.ws) this.connect();
    } else {
      log('qchat', 'Aurabot 已断开，断开与 QChat 的连接（机器人显示离线）');
      this.shutdown();
    }
  }

  shutdown() {
    clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
  }

  connect() {
    if (!this.want || this.ws) return;
    log('qchat', `连接 ${opts.qchatUrl} ...`);
    const ws = new WebSocket(opts.qchatUrl);
    this.ws = ws;
    ws.on('open', () => {
      this.connected = true;
      log('qchat', '已连上 QChat，发送 hello');
      ws.send(JSON.stringify({ type: 'hello', name: opts.botName }));
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      if (msg.type === 'hello-ok') {
        log('qchat', `握手成功，机器人名：${msg.botId || opts.botName}`);
      } else if (msg.type === 'message') {
        this.handleMessage(msg);
      }
    });
    ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      if (this.want) {
        log('qchat', '连接断开，5 秒后重连');
        this.scheduleReconnect();
      }
    });
    ws.on('error', (err) => {
      log('warn', `QChat 连接错误：${err.message}`);
    });
  }

  scheduleReconnect() {
    if (this.retry || !this.want) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, 5000);
  }

  handleMessage(msg) {
    const text = typeof msg.text === 'string' ? msg.text : '';
    const segs = [];
    if (text) segs.push({ type: 'text', data: { text } });
    for (const att of msg.attachments || []) {
      if (att.type === 'image') {
        segs.push({ type: 'image', data: { file: `base64://${att.data || ''}`, sub_type: 0 } });
      } else if (att.type === 'voice') {
        segs.push({ type: 'record', data: { file: `base64://${att.data || ''}` } });
      } else if (att.type === 'file') {
        segs.push({ type: 'file', data: { file: `base64://${att.data || ''}`, name: att.name } });
      }
    }
    if (msg.attachments && msg.attachments.some((a) => a.type === 'voice') && !text) {
      segs.push({ type: 'text', data: { text: '[语音]' } });
    }
    if (segs.length === 0) return;
    this.emitEvent(segs, text);
  }

  emitEvent(segs, text) {
    const ev = {
      time: Math.floor(Date.now() / 1000),
      self_id: opts.selfId,
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: ++msgSeq,
      user_id: opts.ownerId,
      message: opts.messageFormat === 'array' ? segs : segs.map(segToCQString).join(''),
      raw_message: opts.messageFormat === 'array' ? segs.map(segToCQString).join('') : segs.map(segToCQString).join(''),
      font: 0,
      sender: {
        user_id: opts.ownerId,
        nickname: opts.ownerName,
        card: '',
        sex: 'unknown',
        age: 0,
      },
      target_id: opts.selfId,
      message_seq: msgSeq,
      real_id: msgSeq,
    };
    log('qchat', `收到 QChat 消息：${text.slice(0, 40)}`);
    this.onEvent && this.onEvent(ev);
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log('warn', 'QChat 未连接，消息无法发出');
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    return true;
  }
}

let msgSeq = 1000;

function segToCQString(seg) {
  if (seg.type === 'text') return seg.data.text || '';
  const kv = Object.entries(seg.data || {})
    .map(([k, v]) => `${k}=${String(v).replace(/&/g, '&amp;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/,/g, '&#44;')}`)
    .join(',');
  return `[CQ:${seg.type}${kv ? ',' + kv : ''}]`;
}

/* ---------- OneBot v11 服务端 ---------- */

const clients = new Set(); // 已连接的 Aurabot WS 客户端

function broadcast(ev) {
  const payload = JSON.stringify(ev);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (_) {}
    }
  }
  log('event', `广播 ${ev.post_type || ev.action || ''} 到 ${clients.size} 个客户端`);
}

function replyJson(echo, data, ok = true, message = '', retcode = 0) {
  return {
    status: ok ? 'ok' : 'failed',
    retcode: ok ? retcode : retcode || 1400,
    data: data ?? null,
    message: message || undefined,
    wording: message || undefined,
    echo: echo || undefined,
  };
}

async function handleAction(action, params = {}) {
  switch (action) {
    case 'get_login_info':
    case 'get_self_info':
      return replyJson(null, { user_id: opts.selfId, nickname: opts.botName });
    case 'get_version_info':
      return replyJson(null, {
        app_name: 'qchat-bridge',
        app_version: '0.1.0',
        protocol_version: 'v11',
        app_full_name: 'QChat ⇄ OneBot v11 桥',
      });
    case 'get_status':
      return replyJson(null, { online: true, good: true });
    case 'get_friend_list':
      return replyJson(null, [
        { user_id: opts.ownerId, nickname: opts.ownerName, remark: opts.ownerName },
      ]);
    case 'get_stranger_info':
      return replyJson(null, {
        user_id: Number(params.user_id) || opts.ownerId,
        nickname: opts.ownerName,
        sex: 'unknown',
        age: 0,
      });
    case 'send_private_msg':
    case 'send_msg': {
      const segs = segmentsOf(params.message);
      const { text, attachments } = await toQChat(segs);
      if (!text && attachments.length === 0) {
        return replyJson(null, {}, false, '消息为空', 1400);
      }
      const ok = qchat.send({ type: 'reply', text, attachments });
      if (!ok) return replyJson(null, {}, false, 'QChat 未连接', 1401);
      const id = ++msgSeq;
      return replyJson(null, { message_id: id, message_seq: id });
    }
    case 'send_group_msg':
      return replyJson(null, {}, false, 'QChat 桥不支持群聊', 1404);
    case 'set_input_status':
      // 对方输入中，QChat 没有对应展示，静默成功
      return replyJson(null, {});
    case 'set_msg_emoji_like':
    case 'delete_msg':
      return replyJson(null, {});
    case 'get_group_list':
      return replyJson(null, []);
    case 'get_group_member_list':
    case 'get_group_member_info':
    case 'get_group_info':
    case 'get_msg':
    case 'get_forward_msg':
    case 'get_record':
    case 'fetch_ptt_text':
    case 'send_poke':
    case 'get_group_msg_history':
      return replyJson(null, {}, false, `${action} 不在 QChat 桥支持范围`, 1404);
    default:
      return replyJson(null, {}, false, `未实现的接口：${action}`, 1404);
  }
}

function checkToken(req) {
  if (!opts.token) return true;
  const auth = req.headers?.authorization || '';
  const q = new URL(req.url, 'http://x').searchParams.get('access_token') || '';
  return auth === `Bearer ${opts.token}` || q === opts.token;
}

const server = http.createServer(async (req, res) => {
  if (!checkToken(req)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify(replyJson(null, {}, false, 'token 无效', 1403)));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify(replyJson(null, {}, false, '只支持 POST', 1400)));
    return;
  }
  const action = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\/+/, ''));
  if (!action) {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  let params = {};
  try {
    params = body ? JSON.parse(body) : {};
  } catch (_) {}
  log('api', `HTTP ${action}`);
  const out = await handleAction(action, params);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(out));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  if (!checkToken(req)) {
    ws.close(4003, 'token invalid');
    return;
  }
  clients.add(ws);
  log('ws', `OneBot 客户端接入，当前 ${clients.size} 个`);
  qchat.setWanted(true);
  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }
    if (!data || !data.action) return;
    const out = await handleAction(data.action, data.params || {});
    out.echo = data.echo;
    try {
      ws.send(JSON.stringify(out));
    } catch (_) {}
  });
  ws.on('close', () => {
    clients.delete(ws);
    log('ws', `OneBot 客户端断开，剩余 ${clients.size} 个`);
    if (clients.size === 0) {
      // 给 Aurabot 一点重连时间，避免闪断导致机器人来回上下线
      setTimeout(() => {
        if (clients.size === 0) qchat.setWanted(false);
      }, 5000);
    }
  });
  ws.on('error', () => {});
});

const qchat = new QChatLink();
qchat.onEvent = (ev) => broadcast(ev);
// 注意：不在这里连 QChat。只有 Aurabot 连上桥（clients.size > 0）时才连，
// 否则没装 DSH 的电脑上「大肥鱼」会一直显示在线。

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    log('bridge', `端口 ${opts.port} 已被占用：可能桥已经在运行了，不必重复启动。`);
  } else {
    log('bridge', '服务启动失败：' + (err && err.message));
  }
  process.exit(1);
});

server.listen(opts.port, '127.0.0.1', () => {
  log('bridge', `OneBot v11 服务已启动：HTTP http://127.0.0.1:${opts.port}  WS ws://127.0.0.1:${opts.port}`);
  log('bridge', `QChat：${opts.qchatUrl}  机器人名：${opts.botName}  主人 QQ：${opts.ownerId}`);
});
