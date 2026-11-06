'use strict';
/*
 * 配置：.env 优先，缺省值面向本机开发。
 * 线上只改 .env 的 DB_* / PORT，代码不动。
 */
const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(path.join(__dirname, '..', '.env'));

const env = process.env;

module.exports = {
  demoSeed: env.XFT_DEMO_SEED === '1',
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'xft',
    password: env.DB_PASSWORD || 'xft_dev_2026',
    database: env.DB_NAME || 'xinfutong'
  },
  ai: {
    baseUrl: (env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: env.AI_API_KEY || '',
    model: env.AI_MODEL || 'deepseek-chat',
    timeoutMs: Number(env.AI_TIMEOUT_MS || 45000)
  },
  server: {
    port: Number(env.PORT_V2 || env.PORT || 8790),
    host: env.HOST || '0.0.0.0'
  },
  session: {
    ttlDays: Number(env.SESSION_TTL_DAYS || 7),
    cookie: 'xft_sid'
  },
  publicBaseUrl: (env.XFT_PUBLIC_BASE_URL || `http://127.0.0.1:${env.PORT_V2 || env.PORT || 8790}`).replace(/\/+$/, ''),
  python: env.PYTHON || 'python3',
  signKey: env.XFT_SIGN_KEY || 'xinfutong-dev-key',
  // 短信验证码（阿里云短信认证）。mode=dev 走本地假发码（无费用、便于联调），mode=aliyun 走真实下发。
  sms: {
    mode: env.SMS_MODE || 'dev',                       // dev | aliyun
    endpoint: env.SMS_ENDPOINT || 'dypnsapi.aliyuncs.com',
    accessKeyId: env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: env.SMS_ACCESS_KEY_SECRET || '',
    signName: env.SMS_SIGN_NAME || '',
    templateCode: env.SMS_TEMPLATE_CODE || '',
    schemeName: env.SMS_SCHEME_NAME || '',             // 方案名称，发送与核验须一致；留空用默认方案
    required: env.SMS_REQUIRED === '1',                // 是否强制注册前完成手机号短信核验
    codeTtlSeconds: Number(env.SMS_CODE_TTL || 300),   // 验证码有效期
    verifyTtlSeconds: Number(env.SMS_VERIFY_TTL || 3600), // 核验通过后到注册的宽限期
    resendSeconds: Number(env.SMS_RESEND || 60)        // 同一号码两次发送的最小间隔
  }
};
