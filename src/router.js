'use strict';
/*
 * 极简路由：正则匹配 + 参数抽取。
 * 路由只做三件事：鉴权、取参、调 service —— 业务不写在路由里。
 */
const { json, fail, readBody, parseCookies, setCookie } = require('./http.js');
const auth = require('./services/auth.js');
const config = require('./config.js');

function createRouter() {
  const routes = [];

  function add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, ...opts });
  }

  const get = (p, h, o) => add('GET', p, h, o);
  const post = (p, h, o) => add('POST', p, h, o);
  const put = (p, h, o) => add('PUT', p, h, o);
  const del = (p, h, o) => add('DELETE', p, h, o);
  const patch = (p, h, o) => add('PATCH', p, h, o);

  async function dispatch(req, res, url) {
    const path = url.pathname;
    const cookies = parseCookies(req);
    const user = await auth.resolve(cookies[config.session.cookie]);
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      if (r.auth && !user) return fail(res, 401, '请先登录');
      try {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req, r.bodyLimit) : {};
        const out = await r.handler({ req, res, url, params, body, user, ip, cookies });
        if (res.writableEnded) return true;
        if (out === undefined) return json(res, 200, { ok: true });
        if (out && out.__raw) return true;
        return json(res, 200, { ok: true, ...out });
      } catch (e) {
        if (e && e.code === 'NOT_FOUND') return fail(res, 404, e.message);
        if (e && e.code === 'FORBIDDEN') return fail(res, 403, e.message);
        console.error(`[${req.method} ${path}]`, e);
        return fail(res, 400, e.message || '请求处理失败');
      }
    }
    return false;
  }

  return { add, get, post, put, patch, del, dispatch, setCookie };
}

module.exports = { createRouter };
