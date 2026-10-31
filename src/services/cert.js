'use strict';
/*
 * 凭证服务：链式存证 + 扫码验真。
 *  - 把凭证要素规范化后取 SHA-256 摘要
 *  - prev_hash 指向同一案件上一张凭证，形成链
 *  - 用服务端密钥做 HMAC 签名，防伪造
 *  - 验真时按当前数据库重算摘要，与库中摘要比对 → 可判定「已篡改」
 */
const db = require('../db.js');
const config = require('../config.js');
const { sha256, hmac } = require('../crypto.js');

function canonical(e, k) {
  return [e.credit_code, e.name, k.id, k.doc_no || '', k.event || '', k.authority || '', k.removed_date || k.listed_date || ''].join('|');
}

async function issue(caseId, { months = 12 } = {}) {
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!k) throw new Error('案件不存在');
  const e = await db.one('SELECT * FROM enterprises WHERE id = ?', [k.enterprise_id]);
  const last = await db.one('SELECT prev_hash, digest, code FROM certificates ORDER BY issued_at DESC LIMIT 1');
  const digest = sha256(canonical(e, k));
  const prev = last ? last.digest : '0'.repeat(64);
  const issuedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const code = 'XF-C-' + sha256(digest + issuedAt).slice(0, 12).toUpperCase();
  const signature = hmac(digest + '|' + prev + '|' + code, config.signKey);
  const validUntil = new Date(Date.now() + months * 30.4 * 864e5).toISOString().slice(0, 10);
  await db.run(`INSERT INTO certificates (code, case_id, doc_no, digest, prev_hash, signature, issued_at, valid_until, status)
                VALUES (?,?,?,?,?,?,?,?,'valid')`,
    [code, caseId, k.doc_no, digest, prev, signature, issuedAt, validUntil]);
  await db.run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?, NOW(), ?, ?, ?)',
    [caseId, '系统', '签发信用修复状态凭证', code]);
  return get(code);
}

async function get(code) {
  return db.one('SELECT * FROM certificates WHERE code = ?', [code]);
}

async function verify(code) {
  const cert = await get(code);
  if (!cert) return { state: 'notfound', message: '未找到该凭证编号' };
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [cert.case_id]);
  const e = k ? await db.one('SELECT * FROM enterprises WHERE id = ?', [k.enterprise_id]) : null;
  const expectSig = hmac(cert.digest + '|' + cert.prev_hash + '|' + cert.code, config.signKey);
  const recalc = k && e ? sha256(canonical(e, k)) : '';
  const today = new Date().toISOString().slice(0, 10);
  let state = 'valid';
  let message = '凭证有效，内容与存证一致。';
  if (cert.status === 'revoked') { state = 'revoked'; message = '凭证已被签发方撤销。' + (cert.revoked_reason || ''); }
  else if (expectSig !== cert.signature || recalc !== cert.digest) { state = 'tampered'; message = '凭证内容与存证摘要不一致，可能被篡改。'; }
  else if (cert.valid_until && cert.valid_until < today) { state = 'expired'; message = '凭证已过有效期，请要求企业重新出具。'; }
  await db.run('INSERT INTO cert_scans (code, ip, ua, result) VALUES (?,?,?,?)', [code, '', '', state]);
  return {
    state, message,
    certificate: {
      code: cert.code, docNo: cert.doc_no, issuedAt: cert.issued_at, validUntil: cert.valid_until,
      digest: cert.digest, prevHash: cert.prev_hash, status: cert.status
    },
    case: k ? { id: k.id, event: k.event, authority: k.authority, docNo: k.doc_no, listedDate: k.listed_date, removedDate: k.removed_date, level: k.level } : null,
    enterprise: e ? { name: e.name, creditCode: e.credit_code, legal: e.legal } : null
  };
}

async function revoke(code, reason) {
  await db.run("UPDATE certificates SET status = 'revoked', revoked_reason = ?, revoked_at = NOW() WHERE code = ?", [reason || '', code]);
  return get(code);
}

async function listOf(caseId) {
  return db.all('SELECT * FROM certificates WHERE case_id = ? ORDER BY issued_at DESC', [caseId]);
}

module.exports = { issue, verify, revoke, listOf, get, canonical };
