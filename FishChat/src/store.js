'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 极简 JSON 持久化：机器人资料 + 每个机器人的消息记录。
 * 数据保存在 Electron userData 目录（%APPDATA%\FishChat\data.json）。
 */
class Store {
  constructor(file) {
    this.file = file;
    this.data = { bots: {}, messages: {}, meta: {} };
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        bots: parsed.bots && typeof parsed.bots === 'object' ? parsed.bots : {},
        messages:
          parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
      };
    } catch (_) {
      // 首次启动或文件损坏：使用空数据
    }
  }

  /** 异步防抖写入（写临时文件再替换，避免半截文件） */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tmp, this.file);
      } catch (err) {
        console.error('[store] save failed:', err);
      }
    }, 200);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] flush failed:', err);
    }
  }

  ensureBot(name) {
    if (!this.data.bots[name]) {
      this.data.bots[name] = { name, lastSeen: 0, online: false };
      this.save();
    }
    return this.data.bots[name];
  }

  setBotOnline(name, online) {
    const bot = this.ensureBot(name);
    bot.online = !!online;
    bot.lastSeen = Date.now();
    this.save();
    return bot;
  }

  bots() {
    return Object.values(this.data.bots);
  }

  messages(botName) {
    return this.data.messages[botName] || [];
  }

  addMessage(botName, message) {
    if (!this.data.messages[botName]) this.data.messages[botName] = [];
    this.data.messages[botName].push(message);
    this.ensureBot(botName);
    this.save();
    return message;
  }

  markDelivered(botName, messageId) {
    const list = this.data.messages[botName] || [];
    const msg = list.find((m) => m.id === messageId);
    if (msg) {
      msg.delivered = true;
      this.save();
    }
  }

  undelivered(botName) {
    return (this.data.messages[botName] || []).filter(
      (m) => m.from === 'user' && !m.delivered
    );
  }

  clearMessages(botName) {
    this.data.messages[botName] = [];
    this.save();
  }
}

module.exports = { Store };
