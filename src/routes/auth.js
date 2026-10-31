'use strict';
const { json, fail, setCookie } = require('../http.js');
const auth = require('../services/auth.js');
const config = require('../config.js');

module.exports = function register(r) {
  r.post('/api/auth/register', async ({ body, res, ip }) => {
    const user = await auth.register(body);
    await auth.audit(user.id, 'register', 'user', user.phone, ip);
    return { user };
  });

  r.post('/api/auth/login', async ({ body, res, ip, req }) => {
    const { token, user, expires } = await auth.login({
      phone: String(body.phone || '').trim(),
      password: String(body.password || ''),
      ip,
      ua: req.headers['user-agent'] || ''
    });
    setCookie(res, config.session.cookie, token, {
      maxAge: Math.floor((expires.getTime() - Date.now()) / 1000)
    });
    // 小程序等无法使用 cookie 的客户端，显式声明 x-client: miniapp 时在响应体返回令牌，
    // 后续请求用 Authorization: Bearer <token>。网页端不返回，保持 httpOnly cookie 的防窃取特性。
    const wantToken = String(req.headers['x-client'] || '').toLowerCase() === 'miniapp';
    return wantToken ? { user, token } : { user };
  });

  r.post('/api/auth/logout', async ({ cookies, res, user, ip, req }) => {
    const bearer = (/^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '') || [])[1];
    await auth.logout(bearer || cookies[config.session.cookie]);
    setCookie(res, config.session.cookie, '', { maxAge: 0 });
    if (user) await auth.audit(user.id, 'logout', 'user', String(user.id), ip);
    return { byebye: true };
  }, { auth: false });

  r.get('/api/auth/me', async ({ user }) => ({ user }), { auth: false });

  r.get('/api/health', async () => {
    const db = require('../db.js');
    const row = await db.one('SELECT COUNT(*) AS n FROM enterprises');
    return { status: 'ok', enterprises: row.n, at: new Date().toISOString() };
  }, { auth: false });
};
