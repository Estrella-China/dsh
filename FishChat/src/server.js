'use strict';

/**
 * ChatHub —— 机器人接入网关
 *
 * 机器人（任意语言实现）通过 WebSocket 连接到 ws://127.0.0.1:<port>：
 *   1. 连上后 5 秒内必须发送 hello：{"type":"hello","name":"小Q"}
 *   2. 服务端回：{"type":"hello-ok","botId":"小Q","protocol":1}
 *   3. 用户发消息时，机器人收到：
 *      {"type":"message","id":"...","text":"...","attachments":[{"type":"image|file","name":"a.png","size":123,"data":"<base64>"}]}
 *   4. 机器人回复：
 *      {"type":"reply","text":"...","attachments":[...]}    （attachments 的 data 同样是 base64）
 *   5. 机器人主动说话（如定时提醒）：{"type":"message","text":"..."}
 *
 * 同一名字的机器人重复连接会顶掉旧连接。
 */

const { WebSocketServer } = require('ws');

const HELLO_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 30000;

class ChatHub {
  /**
   * @param {{ onEvent?: (event: object) => void }} options
   * onEvent 事件：
   *   { type:'bots', bots:[{name, online}] }
   *   { type:'bot-online', name }
   *   { type:'bot-offline', name }
   *   { type:'bot-message', name, text, attachments }
   */
  constructor(options = {}) {
    this.onEvent = options.onEvent || null;
    this.bots = new Map(); // name -> { name, ws, connectedAt }
    this.server = null;
    this.port = 0;
    this.pingTimer = null;
  }

  _emit(event) {
    if (typeof this.onEvent === 'function') {
      try {
        this.onEvent(event);
      } catch (err) {
        console.error('[hub] onEvent failed:', err);
      }
    }
  }

  list() {
    return [...this.bots.values()].map((b) => ({ name: b.name, online: true }));
  }

  /**
   * 启动网关。preferredPort 被占用时自动向后找一个可用端口。
   * @returns {Promise<number>} 实际监听端口
   */
  start(preferredPort = 3210) {
    return new Promise((resolve, reject) => {
      const tryListen = (port, attemptsLeft) => {
        const wss = new WebSocketServer({ port, host: '127.0.0.1' });
        wss.once('listening', () => {
          this.server = wss;
          this.port = wss.address().port;
          this._bind(wss);
          this._startPing();
          resolve(this.port);
        });
        wss.once('error', (err) => {
          wss.removeAllListeners();
          if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
            tryListen(port + 1, attemptsLeft - 1);
          } else {
            reject(err);
          }
        });
      };
      tryListen(preferredPort, 20);
    });
  }

  _bind(wss) {
    wss.on('connection', (ws) => this._onConnection(ws));
    wss.on('error', (err) => console.error('[hub] server error:', err));
  }

  _onConnection(ws) {
    let botName = null;
    let alive = true;

    const helloTimer = setTimeout(() => {
      if (!botName) {
        try {
          ws.close(4001, 'hello timeout');
        } catch (_) {
          /* ignore */
        }
      }
    }, HELLO_TIMEOUT_MS);

    ws.on('pong', () => {
      alive = true;
    });

    ws.on('message', (raw) => {
      alive = true;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (!botName) {
        if (msg.type === 'hello' && typeof msg.name === 'string' && msg.name.trim()) {
          botName = msg.name.trim().slice(0, 40);
          clearTimeout(helloTimer);

          const old = this.bots.get(botName);
          if (old && old.ws !== ws) {
            try {
              old.ws.close(4002, 'replaced by new connection');
            } catch (_) {
              /* ignore */
            }
          }
          this.bots.set(botName, { name: botName, ws, connectedAt: Date.now() });
          try {
            ws.send(JSON.stringify({ type: 'hello-ok', botId: botName, protocol: 1 }));
          } catch (_) {
            /* ignore */
          }
          this._emit({ type: 'bot-online', name: botName });
          this._emit({ type: 'bots', bots: this.list() });
        } else {
          try {
            ws.close(4003, 'expected hello');
          } catch (_) {
            /* ignore */
          }
        }
        return;
      }

      if (msg.type === 'reply' || msg.type === 'message') {
        this._emit({
          type: 'bot-message',
          name: botName,
          text: typeof msg.text === 'string' ? msg.text : '',
          attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        });
      } else if (msg.type === 'typing') {
        this._emit({ type: 'bot-typing', name: botName });
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (botName && this.bots.get(botName) && this.bots.get(botName).ws === ws) {
        this.bots.delete(botName);
        this._emit({ type: 'bot-offline', name: botName });
        this._emit({ type: 'bots', bots: this.list() });
      }
    });

    ws.on('error', () => {
      try {
        ws.close();
      } catch (_) {
        /* ignore */
      }
    });
  }

  _startPing() {
    this.pingTimer = setInterval(() => {
      for (const bot of this.bots.values()) {
        const ws = bot.ws;
        if (ws.readyState === 1) {
          try {
            ws.ping();
          } catch (_) {
            /* ignore */
          }
        } else {
          try {
            ws.terminate();
          } catch (_) {
            /* ignore */
          }
        }
      }
    }, PING_INTERVAL_MS);
  }

  /** 向指定机器人发送一条消息。返回是否送达。 */
  sendToBot(name, payload) {
    const bot = this.bots.get(name);
    if (!bot) return false;
    const ws = bot.ws;
    if (ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  isOnline(name) {
    return this.bots.has(name);
  }

  stop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const bot of this.bots.values()) {
      try {
        bot.ws.close(1001, 'server stopping');
      } catch (_) {
        /* ignore */
      }
    }
    this.bots.clear();
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }
}

module.exports = { ChatHub };
