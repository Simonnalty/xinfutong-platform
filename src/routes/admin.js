'use strict';
/*
 * 运营与内容：规则参数、政策库、知识库、审计日志、机构、订阅。
 */
const db = require('../db.js');
const rules = require('../services/rules.js');
const auth = require('../services/auth.js');

function requireAdmin(user) {
  if (!user || user.role !== 'admin') { const e = new Error('需要平台运营权限'); e.code = 'FORBIDDEN'; throw e; }
}

module.exports = function register(r) {
  r.get('/api/admin/rule-versions',async({user})=>{requireAdmin(user);return {items:await db.all('SELECT * FROM rule_versions ORDER BY id DESC')}} ,{auth:true});
  r.post('/api/admin/rule-versions',async({user,body})=>{requireAdmin(user);return {rule:await require('../services/rule-versions').create(body,user)}} ,{auth:true});

  r.get('/api/admin/rules', async ({ user }) => {
    requireAdmin(user);
    return { items: await db.all('SELECT * FROM rule_params ORDER BY id') };
  }, { auth: true });

  r.put('/api/admin/rules/:key', async ({ user, params, body, ip }) => {
    requireAdmin(user);
    if(!Number.isInteger(Number(body.value))||Number(body.value)<0||Number(body.value)>120)throw new Error('参数须为 0 至 120 的整数');
    await db.run('UPDATE rule_params SET pvalue = ? WHERE pkey = ?', [String(body.value), params.key]);
    rules.invalidate();
    await auth.audit(user.id, 'rule_update', params.key, String(body.value), ip);
    return { items: await db.all('SELECT * FROM rule_params ORDER BY id') };
  }, { auth: true });

  r.get('/api/admin/audit', async ({ user, url }) => {
    requireAdmin(user);
    const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));
    return { items: await db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]) };
  }, { auth: true });

  r.get('/api/admin/orgs', async ({ user }) => {
    requireAdmin(user);
    return { items: await db.all('SELECT * FROM orgs ORDER BY id') };
  }, { auth: true });

  r.get('/api/admin/stats', async ({ user }) => {
    requireAdmin(user);
    const q = async sql => (await db.one(sql)).n;
    return {
      enterprises: await q('SELECT COUNT(*) AS n FROM enterprises'),
      cases: await q('SELECT COUNT(*) AS n FROM cases'),
      repaired: await q("SELECT COUNT(*) AS n FROM cases WHERE stage = 'repaired'"),
      certificates: await q('SELECT COUNT(*) AS n FROM certificates'),
      scans: await q('SELECT COUNT(*) AS n FROM cert_scans'),
      objections: await q('SELECT COUNT(*) AS n FROM objections'),
      aiCalls: await q("SELECT COALESCE(SUM(1),0) AS n FROM usage_logs WHERE kind = 'ai_doc'")
    };
  }, { auth: true });
};
