'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');

const tmpFile = path.join(os.tmpdir(), `qchat-store-test-${Date.now()}.json`);

const store = new Store(tmpFile);
store.setBotOnline('小Q', true);
store.addMessage('小Q', {
  id: 'a1',
  from: 'user',
  text: '你好',
  attachments: [],
  time: Date.now(),
  delivered: false,
});
store.addMessage('小Q', {
  id: 'b1',
  from: 'bot',
  text: '你好呀',
  attachments: [],
  time: Date.now(),
  delivered: true,
});

assert.strictEqual(store.messages('小Q').length, 2);
assert.strictEqual(store.undelivered('小Q').length, 1);
store.markDelivered('小Q', 'a1');
assert.strictEqual(store.undelivered('小Q').length, 0);

store.clearMessages('小Q');
assert.strictEqual(store.messages('小Q').length, 0);

store.flush();

// 重新加载
const store2 = new Store(tmpFile);
assert.ok(store2.bots().some((b) => b.name === '小Q'));
assert.strictEqual(store2.messages('小Q').length, 0);

fs.unlinkSync(tmpFile);
console.log('store tests passed');
process.exit(0);
