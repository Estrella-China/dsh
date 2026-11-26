'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.amr': 'audio/amr',
};

function sanitizeName(name) {
  const base = String(name || 'file')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'file';
}

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** 把 base64 附件保存到磁盘，返回生成的文件名（用于 qfile:// 引用）。 */
function saveAttachment(filesDir, dataBase64, originalName) {
  fs.mkdirSync(filesDir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${sanitizeName(
    originalName
  )}`;
  fs.writeFileSync(path.join(filesDir, name), Buffer.from(dataBase64, 'base64'));
  return name;
}

/** 读回已保存的附件，转 base64（用于机器人重连后补发未送达消息）。 */
function readAttachmentBase64(filesDir, name) {
  try {
    return fs.readFileSync(path.join(filesDir, path.basename(name))).toString('base64');
  } catch (_) {
    return null;
  }
}

/** 附件的绝对路径（用于系统默认程序打开）。 */
function attachmentPath(filesDir, name) {
  return path.join(filesDir, path.basename(String(name || '')));
}

module.exports = {
  saveAttachment,
  readAttachmentBase64,
  attachmentPath,
  mimeOf,
  sanitizeName,
};
