'use strict';

const state = {
  port: 0,
  userDataPath: '',
  bots: [], // { name, online, lastSeen }
  messages: {}, // botName -> [{ id, from, text, attachments, time, delivered }]
  active: null,
  unread: {}, // botName -> count
  pending: [], // 待发送附件 { type, name, size, data, preview }
  search: '',
  typingTimer: null,
  avatars: {}, // 'user' | 'bot:<name>' -> 文件名
  aliases: {}, // 原始机器人名 -> 显示名
};

const rec = {
  active: false,
  mediaRecorder: null,
  stream: null,
  chunks: [],
  startTime: 0,
  timer: null,
};

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅',
  '🙃', '😴', '😭', '😤', '😡', '🥳', '🤗', '😏', '😋', '😜',
  '👌', '👍', '👎', '🙏', '👏', '💪', '🤝', '✌️', '🤞', '👀',
  '❤️', '💔', '💯', '🔥', '✨', '🎉', '🎊', '🍀', '🌙', '☀️',
  '⭐', '🌈', '🍉', '🍔', '🧋', '🐱', '🐶', '🐼', '🦊', '🤖',
  '👻', '💩', '✅', '❌', '❓', '❗', '⏰', '📌', '🔔', '🎯',
];

const STICKERS = [
  { file: '01.svg', label: '开心' },
  { file: '02.svg', label: '大笑' },
  { file: '03.svg', label: '委屈' },
  { file: '04.svg', label: '流泪' },
  { file: '05.svg', label: '生气' },
  { file: '06.svg', label: '惊讶' },
  { file: '07.svg', label: '害羞' },
  { file: '08.svg', label: '疑问' },
  { file: '09.svg', label: '加油' },
  { file: '10.svg', label: '晚安' },
  { file: '11.svg', label: '666' },
  { file: '12.svg', label: '收到' },
];

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/* ---------- 工具 ---------- */
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timeStr(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateStr(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '语音';
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

function botAvatar(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function displayName(name) {
  return state.aliases[name] || name;
}

function avatarUrl(key) {
  const file = state.avatars[key];
  return file ? 'qfile://local/' + encodeURIComponent(file) : null;
}

function isImageName(name) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || '');
}

function lastMessageOf(botName) {
  const list = state.messages[botName] || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.text || (m.attachments && m.attachments.length)) return m;
  }
  return null;
}

function snippetOf(msg) {
  if (!msg) return '还没有聊天记录';
  if (msg.text) return msg.text.replace(/\s+/g, ' ');
  if (msg.attachments && msg.attachments.length) {
    const a = msg.attachments[0];
    return a.type === 'image' ? '[图片]' : `[文件] ${a.name}`;
  }
  return '';
}

/* ---------- 渲染 ---------- */
function renderBots() {
  const list = $('#bot-list');
  list.innerHTML = '';

  const filtered = state.bots.filter(
    (b) => !state.search || b.name.toLowerCase().includes(state.search.toLowerCase())
  );

  if (filtered.length === 0) {
    const empty = el('div', 'system-line', '还没有机器人连接');
    list.appendChild(empty);
    return;
  }

  for (const bot of filtered) {
    const item = el('div', 'bot-item');
    if (state.active === bot.name) item.classList.add('active');
    item.dataset.name = bot.name;

    const avatar = el('div', 'avatar');
    const avUrl = avatarUrl('bot:' + bot.name);
    if (avUrl) {
      const img = el('img');
      img.src = avUrl;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = botAvatar(displayName(bot.name));
    }
    const dot = el('span', 'dot');
    if (bot.online) dot.classList.add('on');
    avatar.appendChild(dot);

    const meta = el('div', 'bot-meta');
    const nameRow = el('div', 'bot-name-row');
    const name = el('div', 'bot-name', displayName(bot.name));
    const last = lastMessageOf(bot.name);
    const time = el('div', 'bot-time', last ? timeStr(last.time) : '');
    nameRow.appendChild(name);
    nameRow.appendChild(time);

    const snippet = el('div', 'bot-snippet', snippetOf(last));
    meta.appendChild(nameRow);
    meta.appendChild(snippet);

    item.appendChild(avatar);
    item.appendChild(meta);

    const unread = state.unread[bot.name] || 0;
    if (unread > 0) {
      item.appendChild(el('span', 'badge', unread > 99 ? '99+' : String(unread)));
    }

    item.addEventListener('click', () => selectBot(bot.name));
    list.appendChild(item);
  }
}

function renderChat() {
  const messages = $('#messages');
  const nameEl = $('#chat-name');
  const statusEl = $('#chat-status');

  if (!state.active) {
    nameEl.textContent = 'FishChat';
    statusEl.textContent = '';
    statusEl.className = 'status offline';
    messages.innerHTML = '';
    messages.appendChild(renderEmptyState());
    $('#composer').classList.add('disabled');
    $('#btn-send').disabled = true;
    $('#btn-rename').classList.add('hidden');
    return;
  }

  const bot = state.bots.find((b) => b.name === state.active);
  nameEl.textContent = displayName(state.active);
  statusEl.textContent = bot && bot.online ? '在线' : '离线（消息会自动保存）';
  statusEl.className = 'status ' + (bot && bot.online ? 'online' : 'offline');
  $('#btn-rename').classList.remove('hidden');

  messages.innerHTML = '';
  const list = state.messages[state.active] || [];

  let lastDay = null;
  for (const msg of list) {
    const day = dateStr(msg.time);
    if (day !== lastDay) {
      messages.appendChild(el('div', 'date-line', day));
      lastDay = day;
    }
    messages.appendChild(renderMessage(msg));
  }

  $('#composer').classList.remove('disabled');
  $('#btn-send').disabled = false;
  scrollBottom();
}

function renderVoice(att) {
  const wrap = el('div', 'voice-msg');
  const btn = el('button', 'voice-play', '▶');
  const bars = el('div', 'voice-bars');
  for (let i = 0; i < 8; i++) {
    const b = el('span');
    b.style.height = 6 + ((i * 7 + 3) % 12) + 'px';
    bars.appendChild(b);
  }
  const dur = el('span', 'voice-dur', formatDuration(att.duration));
  wrap.appendChild(btn);
  wrap.appendChild(bars);
  wrap.appendChild(dur);

  let audio = null;
  let playing = false;
  const sync = () => {
    btn.textContent = playing ? '⏸' : '▶';
  };
  btn.addEventListener('click', () => {
    if (!audio) {
      audio = new Audio('qfile://local/' + encodeURIComponent(att.file));
      audio.addEventListener('ended', () => {
        playing = false;
        sync();
      });
    }
    if (playing) {
      audio.pause();
      playing = false;
    } else {
      audio.play();
      playing = true;
    }
    sync();
  });
  return wrap;
}

function renderEmptyState() {
  const wrap = el('div', 'empty-state');
  const mark = el('div', 'big-mark');
  const markImg = el('img');
  markImg.src = 'icon.png';
  markImg.alt = '';
  mark.appendChild(markImg);
  const h2 = el('h2', null, '还没有机器人上线');
  const p = el('p');
  p.innerHTML =
    'FishChat 已经在本机开了机器人接入端口。用你的机器人程序（Python / Node 都行）连上它，就能开始聊天。<br/>示例机器人 <code>bot/bot_example.py</code> 装好 <code>pip install websockets</code> 直接运行即可。';
  const addrWrap = el('div', 'addr');
  const addr = el('code', null, `ws://127.0.0.1:${state.port}`);
  const copy = el('button', 'mini-btn', '复制');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`ws://127.0.0.1:${state.port}`);
      toast('地址已复制');
    } catch (_) {
      toast('复制失败，请手动复制');
    }
  });
  addrWrap.appendChild(addr);
  addrWrap.appendChild(copy);
  wrap.appendChild(mark);
  wrap.appendChild(h2);
  wrap.appendChild(p);
  wrap.appendChild(addrWrap);
  return wrap;
}

function renderMessage(msg) {
  const row = el('div', 'msg-row ' + (msg.from === 'user' ? 'user' : 'bot'));

  const avatar = el('div', 'msg-avatar');
  const isUser = msg.from === 'user';
  const avUrl = avatarUrl(isUser ? 'user' : 'bot:' + state.active);
  if (avUrl) {
    const img = el('img');
    img.src = avUrl;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = isUser ? '我' : displayName(state.active).trim().charAt(0).toUpperCase();
  }
  row.appendChild(avatar);

  const body = el('div', 'msg-body');
  const meta = el('div', 'msg-meta');
  meta.textContent = timeStr(msg.time);
  body.appendChild(meta);

  if (msg.text) {
    body.appendChild(el('div', 'bubble', msg.text));
  }

  for (const att of msg.attachments || []) {
    if (att.type === 'image') {
      const img = el('img', 'msg-img');
      img.src = 'qfile://local/' + encodeURIComponent(att.file);
      img.title = att.name;
      img.addEventListener('click', () => window.fishchat.openFile(att.file));
      body.appendChild(img);
    } else if (att.type === 'voice') {
      body.appendChild(renderVoice(att));
    } else {
      const card = el('div', 'file-card');
      const icon = el('div', 'file-icon', '📄');
      const info = el('div');
      info.appendChild(el('div', 'file-name', att.name || '文件'));
      info.appendChild(el('div', 'file-size', formatSize(att.size)));
      card.appendChild(icon);
      card.appendChild(info);
      card.addEventListener('click', () => window.fishchat.openFile(att.file));
      body.appendChild(card);
    }
  }

  row.appendChild(body);
  return row;
}

function scrollBottom() {
  const messages = $('#messages');
  messages.scrollTop = messages.scrollHeight;
}

/* ---------- 交互 ---------- */
function selectBot(name) {
  if (rec.active) cancelRecording();
  state.active = name;
  state.unread[name] = 0;
  window.fishchat.setActive(name);
  renderBots();
  renderChat();
  closePanels();
}

function closePanels() {
  $('#emoji-panel').classList.add('hidden');
  $('#sticker-panel').classList.add('hidden');
}

function showTyping() {
  const t = $('#typing');
  t.classList.remove('hidden');
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function readAsBase64(file) {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function addFiles(files) {
  if (!state.active) {
    toast('先选择一个机器人');
    return;
  }
  for (const file of files) {
    if (!file) continue;
    if (file.size > 20 * 1024 * 1024) {
      toast(`「${file.name}」超过 20MB，已跳过`);
      continue;
    }
    const data = await readAsBase64(file);
    const type =
      file.type && file.type.startsWith('image/')
        ? 'image'
        : (file.type && file.type.startsWith('audio/')) || /^voice-/i.test(file.name || '')
          ? 'voice'
          : 'file';
    const att = {
      type,
      name: file.name || (type === 'image' ? 'image.png' : type === 'voice' ? 'voice.webm' : 'file'),
      size: file.size,
      data,
      preview: type === 'image' ? `data:${file.type};base64,${data}` : '',
      duration: 0,
    };
    state.pending.push(att);
  }
  renderPending();
}

function renderPending() {
  const wrap = $('#attachments');
  wrap.innerHTML = '';
  if (state.pending.length === 0) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  for (let i = 0; i < state.pending.length; i++) {
    const att = state.pending[i];
    const chip = el('div', 'attachment-chip');
    if (att.type === 'image' && att.preview) {
      const img = el('img');
      img.src = att.preview;
      chip.appendChild(img);
    } else if (att.type === 'voice') {
      chip.appendChild(el('span', null, '🎤'));
    } else {
      chip.appendChild(el('span', null, '📄'));
    }
    chip.appendChild(
      el('span', 'chip-name', att.type === 'voice' ? `语音 ${formatDuration(att.duration)}` : att.name)
    );
    const rm = el('button', 'chip-remove', '✕');
    rm.addEventListener('click', () => {
      state.pending.splice(i, 1);
      renderPending();
    });
    chip.appendChild(rm);
    wrap.appendChild(chip);
  }
}

async function toggleRecording() {
  if (rec.active) {
    stopRecording();
    return;
  }
  if (!state.active) {
    toast('先选择一个机器人');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec.stream = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
      .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    rec.mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.chunks = [];
    rec.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) rec.chunks.push(e.data);
    };
    rec.mediaRecorder.onstop = () => finalizeRecording();
    rec.mediaRecorder.start();
    rec.active = true;
    rec.startTime = Date.now();
    $('#btn-voice').classList.add('recording');
    $('#recording-bar').classList.remove('hidden');
    updateRecTime();
    rec.timer = setInterval(updateRecTime, 250);
  } catch (err) {
    toast('无法使用麦克风：' + ((err && err.message) || err));
  }
}

function updateRecTime() {
  const sec = Math.floor((Date.now() - rec.startTime) / 1000);
  $('#rec-time').textContent = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

function stopRecording() {
  if (!rec.mediaRecorder) return;
  try {
    rec.mediaRecorder.stop();
  } catch (_) {
    /* ignore */
  }
  rec.active = false;
  clearInterval(rec.timer);
  $('#btn-voice').classList.remove('recording');
  $('#recording-bar').classList.add('hidden');
}

function cancelRecording() {
  if (rec.mediaRecorder && rec.mediaRecorder.state !== 'inactive') {
    rec.mediaRecorder.onstop = null;
    try {
      rec.mediaRecorder.stop();
    } catch (_) {
      /* ignore */
    }
  }
  rec.active = false;
  rec.chunks = [];
  clearInterval(rec.timer);
  if (rec.stream) {
    rec.stream.getTracks().forEach((t) => t.stop());
    rec.stream = null;
  }
  $('#btn-voice').classList.remove('recording');
  $('#recording-bar').classList.add('hidden');
}

async function finalizeRecording() {
  const duration = Date.now() - rec.startTime;
  const blob = new Blob(rec.chunks, { type: rec.mediaRecorder.mimeType || 'audio/webm' });
  rec.chunks = [];
  if (rec.stream) {
    rec.stream.getTracks().forEach((t) => t.stop());
    rec.stream = null;
  }
  if (duration < 800 || blob.size === 0) {
    toast('录音太短了，再录久一点');
    return;
  }
  try {
    const file = new File([blob], `voice-${Date.now()}.webm`, {
      type: blob.type || 'audio/webm',
    });
    const data = await readAsBase64(file);
    state.pending.push({
      type: 'voice',
      name: file.name,
      size: file.size,
      data,
      preview: '',
      duration,
    });
    renderPending();
    updateSendButton();
  } catch (err) {
    toast('语音处理失败');
  }
}

async function sendMessage() {
  if (!state.active) return;
  const input = $('#input');
  const text = input.value;
  const atts = state.pending.slice();
  if (!text.trim() && atts.length === 0) return;

  $('#btn-send').disabled = true;
  try {
    const res = await window.fishchat.send({
      botName: state.active,
      text,
      attachments: atts.map((a) => ({
        type: a.type,
        name: a.name,
        size: a.size,
        duration: a.duration || 0,
        data: a.data,
      })),
    });
    if (!state.messages[state.active]) state.messages[state.active] = [];
    state.messages[state.active].push(res.message);
    input.value = '';
    input.style.height = '';
    state.pending = [];
    renderPending();
    renderBots();
    renderChat();
  } catch (err) {
    const msg = String((err && err.message) || '发送失败').replace(/^Error invoking remote method '[^']+': Error: /, '');
    toast(msg);
  } finally {
    $('#btn-send').disabled = false;
    updateSendButton();
  }
}

function openRename() {
  if (!state.active) return;
  $('#rename-input').value = state.aliases[state.active] || state.active;
  $('#rename-modal').classList.remove('hidden');
  setTimeout(() => {
    const input = $('#rename-input');
    input.focus();
    input.select();
  }, 60);
}

async function saveRename() {
  const name = state.active;
  if (!name) return;
  if (!window.fishchat || typeof window.fishchat.setAlias !== 'function') {
    toast('界面正在更新，请完全关闭 FishChat 后重新打开');
    return;
  }
  const value = $('#rename-input').value.trim();
  try {
    const res = await window.fishchat.setAlias({ name, alias: value });
    if (res.alias) state.aliases[name] = res.alias;
    else delete state.aliases[name];
    $('#rename-modal').classList.add('hidden');
    renderBots();
    renderChat();
    toast('已改名为「' + (res.alias || name) + '」');
  } catch (err) {
    toast('改名失败：' + ((err && err.message) || err));
  }
}

async function openSettings() {
  try {
    if (!window.fishchat || typeof window.fishchat.getSettings !== 'function') {
      $('#set-notify').checked = true;
      $('#set-autostart').checked = false;
      $('#set-tray').checked = true;
      $('#set-version').textContent = '';
      $('#settings-modal').classList.remove('hidden');
      toast('界面版本较旧，请完全关闭 FishChat 后重新打开');
      return;
    }
    const s = await window.fishchat.getSettings();
    $('#set-notify').checked = !!s.notify;
    $('#set-autostart').checked = !!s.autoStart;
    $('#set-tray').checked = s.closeToTray !== false;
    $('#set-version').textContent = 'v' + (s.version || '');
    $('#settings-modal').classList.remove('hidden');
  } catch (err) {
    toast('读取设置失败：' + ((err && err.message) || err));
  }
}

function pickAvatar(target) {  if (target === 'bot' && !state.active) {
    toast('先在左边选一个机器人');
    return;
  }
  const input = $('#avatar-input');
  input.dataset.target = target;
  input.dataset.name = target === 'bot' ? state.active : '';
  input.value = '';
  input.click();
}

function updateSendButton() {
  const hasText = $('#input').value.trim().length > 0;
  const hasAtt = state.pending.length > 0;
  $('#btn-send').disabled = !state.active || (!hasText && !hasAtt);
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderBots();
  });

  $('#btn-theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    root.dataset.theme = dark ? '' : 'dark';
    localStorage.setItem('fishchat-theme', dark ? 'light' : 'dark');
    $('#btn-theme').textContent = dark ? '🌙' : '☀️';
  });

  $('#btn-help').addEventListener('click', () => {
    $('#help-address').textContent = `ws://127.0.0.1:${state.port}`;
    $('#help-modal').classList.remove('hidden');
  });
  $('#btn-help-close').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
  $('#help-modal').addEventListener('click', (e) => {
    if (e.target === $('#help-modal')) $('#help-modal').classList.add('hidden');
  });
  $('#btn-copy-address').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`ws://127.0.0.1:${state.port}`);
      toast('地址已复制');
    } catch (_) {
      toast('复制失败，请手动复制');
    }
  });

  $('#btn-open-data').addEventListener('click', () => window.fishchat.openUserData());

  $('#btn-clear').addEventListener('click', async () => {
    if (!state.active) return;
    if (!window.confirm(`清空与「${state.active}」的全部聊天记录？`)) return;
    await window.fishchat.clearChat(state.active);
    state.messages[state.active] = [];
    renderBots();
    renderChat();
  });

  $('#input').addEventListener('input', () => {
    const input = $('#input');
    input.style.height = '';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
    updateSendButton();
  });

  $('#input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $('#btn-voice').addEventListener('click', toggleRecording);
  $('#btn-rec-cancel').addEventListener('click', cancelRecording);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rec.active) cancelRecording();
  });

  $('#btn-avatar').addEventListener('click', () => pickAvatar('bot'));
  $('#btn-my-avatar').addEventListener('click', () => pickAvatar('user'));

  $('#btn-rename').addEventListener('click', openRename);
  $('#btn-rename-close').addEventListener('click', () =>
    $('#rename-modal').classList.add('hidden')
  );
  $('#btn-rename-cancel').addEventListener('click', () =>
    $('#rename-modal').classList.add('hidden')
  );
  $('#btn-rename-save').addEventListener('click', saveRename);
  $('#rename-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename();
    }
  });
  $('#rename-modal').addEventListener('click', (e) => {
    if (e.target === $('#rename-modal')) $('#rename-modal').classList.add('hidden');
  });

  $('#btn-settings').addEventListener('click', openSettings);  $('#btn-settings-close').addEventListener('click', () =>
    $('#settings-modal').classList.add('hidden')
  );
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target === $('#settings-modal')) $('#settings-modal').classList.add('hidden');
  });
  $('#set-notify').addEventListener('change', async (e) => {
    try {
      await window.fishchat.setSettings({ notify: e.target.checked });
      toast(e.target.checked ? '已开启消息通知' : '已关闭消息通知');
    } catch (_) {
      toast('保存失败');
    }
  });
  $('#set-autostart').addEventListener('change', async (e) => {
    try {
      const r = await window.fishchat.setSettings({ autoStart: e.target.checked });
      toast(r.autoStart ? '已开启开机自启动' : '已关闭开机自启动');
    } catch (_) {
      toast('保存失败');
    }
  });

  $('#set-tray').addEventListener('change', async (e) => {
    try {
      await window.fishchat.setSettings({ closeToTray: e.target.checked });
      toast(e.target.checked ? '已开启：关闭窗口后继续在后台运行' : '已关闭：关闭窗口即退出');
    } catch (_) {
      toast('保存失败');
    }
  });
  $('#avatar-input').addEventListener('change', async (e) => {
    const input = e.target;
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件');
      return;
    }
    const target = input.dataset.target || 'bot';
    const name = input.dataset.name || '';
    try {
      const data = await readAsBase64(file);
      const mime = file.type.split('/')[1] || 'png';
      const ext = '.' + (mime === 'jpeg' ? 'jpg' : mime);
      const res = await window.fishchat.setAvatar({ target, name, data, ext });
      state.avatars[res.key] = res.file;
      renderBots();
      renderChat();
      toast('头像已更新');
    } catch (err) {
      toast('换头像失败：' + ((err && err.message) || err));
    }
  });

  $('#btn-send').addEventListener('click', sendMessage);

  for (const btn of document.querySelectorAll('[data-panel]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kind = btn.dataset.panel;
      const panel = kind === 'emoji' ? $('#emoji-panel') : $('#sticker-panel');
      const other = kind === 'emoji' ? $('#sticker-panel') : $('#emoji-panel');
      other.classList.add('hidden');
      if (panel.classList.contains('hidden')) {
        buildPanel(kind);
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.panel') && !e.target.closest('[data-panel]')) {
      closePanels();
    }
  });

  $('#btn-image').addEventListener('click', () => {
    $('#file-input').accept = 'image/*';
    $('#file-input').click();
  });
  $('#btn-file').addEventListener('click', () => {
    $('#file-input').accept = '';
    $('#file-input').click();
  });
  $('#file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await addFiles(files);
  });

  // 拖拽
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    $('#drop-mask').classList.remove('hidden');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) $('#drop-mask').classList.add('hidden');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#drop-mask').classList.add('hidden');
    const files = Array.from(e.dataTransfer.files || []);
    await addFiles(files);
  });

  // 粘贴图片
  document.addEventListener('paste', async (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.files) || []);
    const images = items.filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      e.preventDefault();
      await addFiles(images);
    }
  });

  window.addEventListener('resize', () => {
    const input = $('#input');
    input.style.height = '';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  });
}

/* ---------- 面板 ---------- */
function buildPanel(kind) {
  if (kind === 'emoji') {
    const panel = $('#emoji-panel');
    if (panel.childElementCount > 0) return;
    for (const emoji of EMOJIS) {
      const btn = el('button', 'emoji-item', emoji);
      btn.addEventListener('click', () => {
        const input = $('#input');
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
        updateSendButton();
      });
      panel.appendChild(btn);
    }
  } else {
    const panel = $('#sticker-panel');
    if (panel.childElementCount > 0) return;
    for (const st of STICKERS) {
      const btn = el('button', 'sticker-item');
      btn.title = st.label;
      const img = el('img');
      img.src = `stickers/${st.file}`;
      btn.appendChild(img);
      btn.addEventListener('click', async () => {
        try {
          const res = await window.fishchat.readSticker(st.file);
          const blob = base64ToBlob(res.data, 'image/svg+xml');
          const file = new File([blob], res.name, { type: 'image/svg+xml' });
          await addFiles([file]);
          closePanels();
        } catch (err) {
          toast('表情包读取失败');
        }
      });
      panel.appendChild(btn);
    }
  }
}

/* ---------- 主进程事件 ---------- */
function subscribeEvents() {
  window.fishchat.onEvent((ev) => {
    if (ev.type === 'bots') {
      for (const b of ev.bots) {
        const local = state.bots.find((x) => x.name === b.name);
        if (local) local.online = true;
        else state.bots.push({ name: b.name, online: true, lastSeen: Date.now() });
      }
      renderBots();
    } else if (ev.type === 'bot-online') {
      const local = state.bots.find((x) => x.name === ev.name);
      if (local) local.online = true;
      else state.bots.push({ name: ev.name, online: true, lastSeen: Date.now() });
      renderBots();
      if (state.active === ev.name) renderChat();
    } else if (ev.type === 'bot-offline') {
      const local = state.bots.find((x) => x.name === ev.name);
      if (local) local.online = false;
      renderBots();
      if (state.active === ev.name) renderChat();
    } else if (ev.type === 'bot-typing') {
      if (state.active === ev.name) showTyping();
    } else if (ev.type === 'select-bot') {
      if (ev.name) {
        if (!state.bots.find((b) => b.name === ev.name)) {
          state.bots.push({ name: ev.name, online: false, lastSeen: Date.now() });
        }
        selectBot(ev.name);
      }
    } else if (ev.type === 'message') {
      const name = ev.botName;
      if (!state.messages[name]) state.messages[name] = [];
      state.messages[name].push(ev.message);
      if (state.active === name) {
        renderChat();
        renderBots();
      } else {
        state.unread[name] = (state.unread[name] || 0) + 1;
        renderBots();
      }
    }
  });
}

/* ---------- 启动 ---------- */
async function init() {
  const theme = localStorage.getItem('fishchat-theme');
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    $('#btn-theme').textContent = '☀️';
  }

  const data = await window.fishchat.init();
  state.port = data.port;
  state.userDataPath = data.userDataPath;
  state.bots = data.bots || [];
  state.messages = data.messages || {};
  state.avatars = data.avatars || {};
  state.aliases = data.aliases || {};
  state.active = data.activeBot || null;
  state.pending = [];

  if (!state.bots.find((b) => b.name === state.active) && state.bots.length > 0) {
    state.active = state.bots[0].name;
  }

  $('#port-badge').textContent = `端口 ${state.port}`;
  renderBots();
  renderChat();
  bindEvents();
  subscribeEvents();
  updateSendButton();
}

init().catch((err) => {
  console.error('init failed', err);
  toast('初始化失败：' + (err && err.message ? err.message : err));
});
