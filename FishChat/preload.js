'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 统一 API：同时挂在 fishchat 和 qchat 两个名字下，兼容历史引用
const api = {
  init: () => ipcRenderer.invoke('init'),
  send: (payload) => ipcRenderer.invoke('send', payload),
  setActive: (botName) => ipcRenderer.invoke('set-active', botName),
  openFile: (file) => ipcRenderer.invoke('open-file', file),
  openUserData: () => ipcRenderer.invoke('open-user-data'),
  clearChat: (botName) => ipcRenderer.invoke('clear-chat', botName),
  setAvatar: (payload) => ipcRenderer.invoke('set-avatar', payload),
  setAlias: (payload) => ipcRenderer.invoke('set-alias', payload),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  readSticker: (file) => ipcRenderer.invoke('read-sticker', file),
  quit: () => ipcRenderer.invoke('quit'),
  onEvent: (cb) => {
    ipcRenderer.on('chat-event', (_event, payload) => cb(payload));
  },
};

contextBridge.exposeInMainWorld('fishchat', api);
contextBridge.exposeInMainWorld('qchat', api);
