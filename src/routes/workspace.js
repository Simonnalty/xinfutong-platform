'use strict';
/*
 * 企业空间：企业列表、案件、诊断、文书、任务、时间线。
 * 所有读写都先过 canAccess，避免越权拿到别家企业的数据。
 */
const db = require('../db.js');
const auth = require('../services/auth.js');
const rules = require('../services/rules.js');
const diagnose = require('../services/diagnose.js');
const docs = require('../services/docs.js');

async function guard(user, caseId) {
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!k) { const e = new Error('案件不存在'); e.code = 'NOT_FOUND'; throw e; }
  if (!(await auth.canAccess(user, k.enterprise_id))) {
    const e = new Error('无权访问该案件'); e.code = 'FORBIDDEN'; throw e;
  }
  return k;
}

function levelLabel(level) {
  return rules.LEVELS[level] ? rules.LEVELS[level].label : level;
}

module.exports = function register(r) {
  // 企业列表
  r.get('/api/enterprises', async ({ user }) => ({ items: await auth.enterprisesOf(user) }), { auth: true });

  // 工作台：企业 + 案件列表 + 汇总
  r.get('/api/enterprises/:id/overview', async ({ user, params }) => {
    const id = Number(params.id);
    if (!(await auth.canAccess(user, id))) { const e = new Error('无权访问该企业'); e.code = 'FORBIDDEN'; throw e; }
    const ent = await db.one('SELECT * FROM enterprises WHERE id = ?', [id]);
    const cases = await db.all('SELECT * FROM cases WHERE enterprise_id = ? ORDER BY listed_date DESC', [id]);
    const summary = {
      total: cases.length,
      repaired: cases.filter(c => c.stage === 'repaired').length,
      active: cases.filter(c => c.stage !== 'repaired').length,
      syncIssues: (await db.all(
        `SELECT c.channel_code FROM case_channels c JOIN cases k ON k.id = c.case_id
          WHERE k.enterprise_id = ? AND c.state IN ('warn','bad')`, [id])).length
    };
    return {
      enterprise: ent,
      summary,
      cases: cases.map(c => ({ ...c, levelLabel: levelLabel(c.level) }))
    };
  }, { auth: true });

  // 案件详情（含诊断快照、渠道、文书、任务、时间线）
  r.get('/api/cases/:id', async ({ user, params }) => {
    const kase = await guard(user, params.id);
    const ent = await db.one('SELECT * FROM enterprises WHERE id = ?', [kase.enterprise_id]);
    const today = new Date().toISOString().slice(0, 10);
    const evald = await rules.evaluate(kase, today);
    const built = await docs.build(params.id, today);
    return {
      case: { ...kase, levelLabel: levelLabel(kase.level) },
      enterprise: ent,
      rule: { ...evald, basis: diagnose.BASIS[kase.type] || diagnose.BASIS.penalty },
      docs: Object.entries(built.docs).map(([key, d]) => ({ key, documentKey: key, ...d })),
      channels: await db.all('SELECT * FROM case_channels WHERE case_id = ? ORDER BY sort', [params.id]),
      tasks: await db.all('SELECT * FROM tasks WHERE case_id = ? ORDER BY id', [params.id]),
      timeline: await db.all('SELECT * FROM timeline_events WHERE case_id = ? ORDER BY at', [params.id])
    };
  }, { auth: true });

  // 重新诊断
  r.post('/api/cases/:id/diagnose', async ({ user, params, ip }) => {
    await guard(user, params.id);
    const result = await diagnose.run(params.id);
    await auth.audit(user.id, 'diagnose', params.id, `分数 ${result.score}`, ip);
    return { diagnosis: result };
  }, { auth: true });

  // 文书单份读取
  r.get('/api/cases/:id/docs', async ({ user, params }) => {
    await guard(user, params.id);
    const built = await docs.build(params.id);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({ key, ...d })) };
  }, { auth: true });

  // 保存定稿（AI 润色或手改）
  r.post('/api/cases/:id/docs/:key', async ({ user, params, body, ip }) => {
    await guard(user, params.id);
    const built = await docs.save(params.id, params.key, String(body.html || ''), { source: body.source || 'manual', userId: user.id });
    await auth.audit(user.id, 'doc_save', `${params.id}/${params.key}`, body.source || 'manual', ip);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({ key, ...d })) };
  }, { auth: true });

  // 恢复模板
  r.post('/api/cases/:id/docs/:key/reset', async ({ user, params }) => {
    await guard(user, params.id);
    const built = await docs.reset(params.id, params.key);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({ key, ...d })) };
  }, { auth: true });

  // 一致性校验
  r.post('/api/cases/:id/doc-check', async ({ user, params }) => {
    await guard(user, params.id);
    return { check: await docs.check(params.id) };
  }, { auth: true });

  // 任务勾选
  r.post('/api/tasks/:id/status', async ({ user, params, body }) => {
    const t = await db.one('SELECT * FROM tasks WHERE id = ?', [Number(params.id)]);
    if (!t) { const e = new Error('任务不存在'); e.code = 'NOT_FOUND'; throw e; }
    await guard(user, t.case_id);
    const status = ['todo', 'doing', 'done'].includes(body.status) ? body.status : 'done';
    await db.run('UPDATE tasks SET status = ? WHERE id = ?', [status, t.id]);
    return { task: { ...t, status } };
  }, { auth: true });
};
