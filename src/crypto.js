'use strict';
/*
 * 口令与会话令牌工具。只用 node:crypto，不引第三方。
 * 口令用 scrypt（内存硬，抗 GPU 爆破），存储格式 scrypt$N$r$p$salt$hash。
 */
const crypto = require('node:crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 32;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(plain, stored) {
  try {
    const [alg, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expect = Buffer.from(hashB64, 'base64');
    const got = crypto.scryptSync(String(plain), salt, expect.length, { N: Number(n), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(got, expect);
  } catch {
    return false;
  }
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function hmac(text, key) {
  return crypto.createHmac('sha256', key).update(String(text)).digest('hex');
}

module.exports = { hashPassword, verifyPassword, newToken, sha256, hmac };
