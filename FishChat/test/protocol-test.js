'use strict';

const assert = require('assert');
const WebSocket = require('ws');
const { ChatHub } = require('../src/server');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function once(ws, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), 3000);
    ws.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function onceMessage(ws) {
  return once(ws, 'message').then((raw) => JSON.parse(raw.toString()));
}

(async () => {
  const events = [];
  const hub = new ChatHub({ onEvent: (e) => events.push(e) });
  const port = await hub.start(0);

  // 1. 机器人连接 + hello
  const bot = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(bot, 'open');
  bot.send(JSON.stringify({ type: 'hello', name: '小Q' }));
  const helloOk = await onceMessage(bot);
  assert.strictEqual(helloOk.type, 'hello-ok');
  assert.strictEqual(helloOk.botId, '小Q');
  assert.ok(events.some((e) => e.type === 'bot-online' && e.name === '小Q'), 'bot-online event');
  assert.ok(hub.isOnline('小Q'));

  // 2. 用户发消息 -> 机器人收到
  const sent = hub.sendToBot('小Q', {
    type: 'message',
    id: 'm1',
    text: '你好呀',
    attachments: [{ type: 'image', name: 'a.png', size: 10, data: 'AAAA' }],
  });
  assert.ok(sent, 'sendToBot returns true when online');
  const got = await onceMessage(bot);
  assert.strictEqual(got.type, 'message');
  assert.strictEqual(got.text, '你好呀');
  assert.strictEqual(got.attachments[0].name, 'a.png');

  // 3. 机器人回复 -> 事件冒泡
  bot.send(JSON.stringify({ type: 'reply', text: '你好！我是小Q', attachments: [] }));
  await sleep(120);
  const replyEv = events.find((e) => e.type === 'bot-message');
  assert.ok(replyEv, 'bot-message event');
  assert.strictEqual(replyEv.text, '你好！我是小Q');
  assert.strictEqual(replyEv.name, '小Q');

  // 4. 机器人主动消息（type=message）
  bot.send(JSON.stringify({ type: 'message', text: '我主动说一句' }));
  await sleep(120);
  assert.ok(events.filter((e) => e.type === 'bot-message').length >= 2);

  // 5. 重名连接顶掉旧连接
  const bot2 = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(bot2, 'open');
  bot2.send(JSON.stringify({ type: 'hello', name: '小Q' }));
  const helloOk2 = await onceMessage(bot2);
  assert.strictEqual(helloOk2.type, 'hello-ok');
  await sleep(150);
  assert.strictEqual(bot.readyState, WebSocket.CLOSED, 'old connection closed');
  assert.ok(hub.isOnline('小Q'), 'still online via new connection');

  // 6. 断开 -> offline 事件
  bot2.close();
  await sleep(150);
  assert.ok(!hub.isOnline('小Q'));
  assert.ok(events.some((e) => e.type === 'bot-offline' && e.name === '小Q'));

  // 7. 离线时发送返回 false
  assert.strictEqual(hub.sendToBot('小Q', { type: 'message', text: 'x' }), false);

  // 8. 未 hello 连接会被关闭
  const bad = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(bad, 'open');
  bad.send(JSON.stringify({ type: 'message', text: 'no hello' }));
  await sleep(300);
  assert.notStrictEqual(bad.readyState, WebSocket.OPEN, 'un-helloed connection closed');

  await hub.stop();
  console.log('protocol tests passed');
  process.exit(0);
})().catch((err) => {
  console.error('protocol tests FAILED:', err);
  process.exit(1);
});
