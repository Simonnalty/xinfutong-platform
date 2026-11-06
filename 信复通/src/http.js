'use strict';
/*
 * HTTP 工具：请求体解析、JSON 响应、Cookie、静态文件。
 * 不引框架 —— 但把「路由/中间件」和「业务」隔开，见 router.js。
 */
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function json(res, code, data) {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function fail(res, code, message, extra) {
  json(res, code, { ok: false, error: message, ...(extra || {}) });
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, { maxAge, path: p = '/', httpOnly = true, sameSite = 'Lax' } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, `SameSite=${sameSite}`];
  if (httpOnly) bits.push('HttpOnly');
  if (maxAge != null) bits.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('set-cookie');
  const list = Array.isArray(prev) ? prev.slice() : prev ? [prev] : [];
  list.push(bits.join('; '));
  res.setHeader('set-cookie', list);
}

function sendFile(res, file, code = 200) {
  const st = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  res.writeHead(code, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(file).pipe(res);
}

/** 静态目录托管，找不到就回退 index.html（SPA history 模式） */
function serveStatic(root, urlPath, res) {
  const rel = decodeURIComponent(urlPath.split('?')[0]);
  let file = path.join(root, rel);
  if (!file.startsWith(root)) { fail(res, 403, '禁止访问'); return true; }
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) { sendFile(res, file); return true; }
  } catch { /* 忽略，走回退 */ }
  const index = path.join(root, 'index.html');
  if (fs.existsSync(index)) { sendFile(res, index); return true; }
  return false;
}

function sendBuffer(res, buf, type, filename) {
  res.writeHead(200, {
    'content-type': type || 'application/octet-stream',
    'content-length': buf.length,
    'content-disposition': filename ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}` : 'inline'
  });
  res.end(buf);
}

module.exports = { json, fail, readBody, parseCookies, setCookie, serveStatic, sendFile, sendBuffer };
