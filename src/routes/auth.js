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
    return { user };
  });

  r.post('/api/auth/logout', async ({ cookies, res, user, ip }) => {
    await auth.logout(cookies[config.session.cookie]);
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
