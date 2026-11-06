'use strict';
/*
 * 短信验证码服务（阿里云「短信认证」）。
 *  - dev  模式：本地生成校验码并直接返回（联调用，不产生费用、不依赖 AK）。
 *  - aliyun 模式：调用号码认证服务(PNVS) RPC OpenAPI SendSmsVerifyCode / CheckSmsVerifyCode。
 * 校验状态落库到 sms_verifications 表，注册时据此强制「已核验手机号」。
 */
const https = require('node:https');
const crypto = require('node:crypto');
const config = require('../config.js');
const db = require('../db.js');

const API_VERSION = '2017-05-25';

/* ---------------- 阿里云 RPC 签名（V1） ---------------- */
function percentEncode(s) {
  return encodeURIComponent(String(s))
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function requestParams(params) {
  const regId = config.sms.endpoint === 'dypnsapi.aliyuncs.com' ? 'cn-hangzhou' : '';
  const base = {
    AccessKeyId: config.sms.accessKeyId,
    Action: params.Action,
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomBytes(16).toString('hex'),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: API_VERSION
  };
  if (regId) base.RegionId = regId;
  const merged = { ...base, ...params };
  return merged;
}

function signature(params) {
  const canonical = Object.keys(params).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonical)}`;
  const h = crypto.createHmac('sha1', `${config.sms.accessKeySecret}&`);
  h.update(stringToSign);
  return h.digest('base64');
}

function call(apiName, bizParams) {
  const params = requestParams({ Action: apiName, ...bizParams });
  const sig = signature(params);
  const body = new URLSearchParams({ ...params, Signature: sig }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: config.sms.endpoint,
      path: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body)
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* ignore */ }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('短信接口超时')));
    req.write(body);
    req.end();
  });
}

/* ---------------- 业务：发送与核验 ---------------- */
function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** 发送验证码。返回 { schemeName, devCode?, expiresAt } */
async function send({ phone }) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new Error('手机号格式不正确');
  const now = Date.now();

  // 同号码发送限频
  const last = await db.one(
    'SELECT sent_at, verified FROM sms_verifications WHERE phone = ? ORDER BY id DESC LIMIT 1', [phone]);
  if (last && now - new Date(last.sent_at).getTime() < config.sms.resendSeconds * 1000) {
    const remain = Math.ceil(config.sms.resendSeconds - (now - new Date(last.sent_at).getTime()) / 1000);
    throw new Error(`发送太频繁，请 ${remain} 秒后再试`);
  }

  const code = genCode();
  const schemeName = config.sms.schemeName || '';

  let devCode = null;
  if (config.sms.mode === 'aliyun') {
    const templateParam = JSON.stringify({ code: '##code##', min: String(Math.ceil(config.sms.codeTtlSeconds / 60)) });
    let resp;
    try {
      resp = await call('SendSmsVerifyCode', {
        PhoneNumber: phone,
        SignName: config.sms.signName,
        TemplateCode: config.sms.templateCode,
        TemplateParam: templateParam,
        CodeType: 1,
        CodeLength: 6,
        ValidTime: config.sms.codeTtlSeconds,
        ...(schemeName ? { SchemeName: schemeName } : {}),
        CountryCode: '86',
        OutId: crypto.randomBytes(8).toString('hex')
      });
    } catch (e) {
      throw new Error(`短信服务异常：${e.message}`);
    }
    if (resp.Code !== 'OK') throw new Error(resp.Message || '短信发送失败');
  } else {
    devCode = code;
  }

  await db.run(
    'INSERT INTO sms_verifications (phone, code_hash, scheme, sent_at, expires_at, verified) VALUES (?,?,?,NOW(),DATE_ADD(NOW(), INTERVAL ? SECOND),0)',
    [phone, crypto.createHash('sha256').update(code).digest('hex'), schemeName, config.sms.codeTtlSeconds]);

  return { schemeName, devCode };
}

/** 核验验证码。通过后把该号码标记为已核验。返回 { ok, ... } */
async function check({ phone, code }) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new Error('手机号格式不正确');
  if (!code) throw new Error('请填写验证码');
  const schemeName = config.sms.schemeName || '';
  const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex');

  if (config.sms.mode === 'aliyun') {
    let resp;
    try {
      resp = await call('CheckSmsVerifyCode', {
        PhoneNumber: phone,
        VerifyCode: String(code),
        ...(schemeName ? { SchemeName: schemeName } : {}),
        CountryCode: '86',
        CaseAuthPolicy: 1
      });
    } catch (e) {
      throw new Error(`短信服务异常：${e.message}`);
    }
    const result = resp && resp.Model && resp.Model.VerifyResult;
    if (result !== 'PASS') throw new Error('验证码不正确或已过期');
    await markVerified(phone, schemeName);
    return { ok: true };
  }

  // dev 模式：本地比对
  const row = await db.one(
    "SELECT code_hash, scheme, expires_at, verified FROM sms_verifications WHERE phone = ? AND scheme = ? AND verified = 0 ORDER BY id DESC LIMIT 1",
    [phone, schemeName]);
  if (!row) throw new Error('请先获取验证码');
  // db.js 以 dateStrings:true 返回 MySQL DATETIME 本地时间，须按本地时区解析后再与 Date.now() 比较
  const expires = Date.parse(String(row.expires_at).replace(' ', 'T'));
  if (!Number.isFinite(expires)) throw new Error('验证码已过期，请重新获取');
  if (expires < Date.now()) throw new Error('验证码已过期，请重新获取');
  if (row.code_hash !== codeHash) throw new Error('验证码不正确');
  await markVerified(phone, schemeName);
  return { ok: true };
}

async function markVerified(phone, scheme) {
  await db.run(
    'UPDATE sms_verifications SET verified = 1, verified_at = NOW() WHERE phone = ? AND scheme = ? AND verified = 0',
    [phone, scheme]);
}

/** 注册前校验：该号码是否在宽限期内完成过核验 */
async function isVerified({ phone }) {
  const row = await db.one(
    'SELECT verified_at FROM sms_verifications WHERE phone = ? AND verified = 1 ORDER BY id DESC LIMIT 1', [phone]);
  if (!row) return false;
  const verifiedAt = Date.parse(String(row.verified_at).replace(' ', 'T'));
  if (!Number.isFinite(verifiedAt)) return false;
  return Date.now() - verifiedAt < config.sms.verifyTtlSeconds * 1000;
}

module.exports = { send, check, isVerified };
