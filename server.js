'use strict';
/*
 * 信复通 v2 入口：只做装配 —— 建库、挂路由、托管前端、兜底 404。
 */
const http = require('node:http');
const path = require('node:path');
const config = require('./src/config.js');
const db = require('./src/db.js');
const { createRouter } = require('./src/router.js');
const { serveStatic, fail } = require('./src/http.js');

const router = createRouter();
require('./src/routes/auth.js')(router);
require('./src/routes/workspace.js')(router);
require('./src/routes/sync.js')(router);
require('./src/routes/admin.js')(router);

const WEB = path.join(__dirname, 'web', 'dist');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await router.dispatch(req, res, url);
      if (!handled) fail(res, 404, '接口不存在');
      return;
    }
    if (!serveStatic(WEB, url.pathname, res)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('前端尚未构建：在 web/ 下执行 npm run build');
    }
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent && !res.writableEnded) fail(res, 500, '服务器内部错误');
  }
});

db.ready()
  .then(() => server.listen(config.server.port, config.server.host, () => {
    console.log(`信复通 v2 · http://${config.server.host}:${config.server.port}`);
    console.log(`数据库: ${config.db.host}:${config.db.port}/${config.db.database}`);
    console.log(`AI: ${config.ai.apiKey ? '已配置 ' + config.ai.model : '未配置（模板模式）'}`);
  }))
  .catch(err => {
    console.error('[db] 启动失败：', err.message);
    process.exit(1);
  });

process.on('SIGTERM', async () => { await db.close(); process.exit(0); });
