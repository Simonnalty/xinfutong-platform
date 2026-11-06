'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const config = require('../src/config.js');
const db = require('../src/db.js');
const sms = require('../src/services/sms.js');

test('阿里云发码请求包含动作、模板编号及验证码生成规则', async () => {
  const oldRequest = https.request, oldOne = db.one, oldRun = db.run, oldSms = { ...config.sms };
  let params;
  try {
    Object.assign(config.sms, { mode: 'aliyun', accessKeyId: 'test', accessKeySecret: 'test', signName: 'test-sign', templateCode: '100001', codeTtlSeconds: 300, resendSeconds: 60 });
    db.one = async () => null; db.run = async () => ({});
    https.request = (options, callback) => {
      const req = new EventEmitter(); req.setTimeout = () => {}; req.write = body => { params = new URLSearchParams(body); };
      req.end = () => { const res = new EventEmitter(); callback(res); res.emit('data', Buffer.from('{"Code":"OK"}')); res.emit('end'); };
      return req;
    };
    await sms.send({ phone: '13800138000' });
    assert.equal(params.get('Action'), 'SendSmsVerifyCode');
    assert.equal(params.get('TemplateCode'), '100001');
    assert.equal(params.get('CodeType'), '1');
    assert.equal(params.get('CodeLength'), '6');
    assert.equal(params.get('ValidTime'), '300');
    assert.equal(params.has('SchemeName'), false);
  } finally { https.request = oldRequest; db.one = oldOne; db.run = oldRun; Object.assign(config.sms, oldSms); }
});

test('注册必须核验本次提交的验证码', async () => {
  const smsCheck = sms.check, smsVerified = sms.isVerified, auth = require('../src/services/auth.js'), oldRegister = auth.register;
  const oldRequired = config.sms.required, oldMode = config.sms.mode;
  let handler, checked = false, registered = false;
  try {
    config.sms.required = true; config.sms.mode = 'aliyun';
    sms.isVerified = async () => true;
    sms.check = async ({ code }) => { checked = true; assert.equal(code, '123456'); throw new Error('bad code'); };
    auth.register = async () => { registered = true; };
    require('../src/routes/auth.js')({ post: (path, fn) => { if (path === '/api/auth/register') handler = fn; }, get: () => {} });
    await assert.rejects(handler({ body: { phone: '13800138000', code: '123456' }, ip: '' }), /bad code/);
    assert.equal(checked, true); assert.equal(registered, false);
  } finally { sms.check = smsCheck; sms.isVerified = smsVerified; auth.register = oldRegister; config.sms.required = oldRequired; config.sms.mode = oldMode; }
});
