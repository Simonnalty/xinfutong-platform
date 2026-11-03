'use strict';
/*
 * 企业空间：企业列表、案件、诊断、文书、任务、时间线。
 * 所有读写都先过 canAccess，避免越权拿到别家企业的数据。
 */
const db = require('../db.js');
const auth = require('../services/auth.js');
const rules = require('../services/rules.js');
const diagnose = require('../services/diagnose.js');
const stage = require('../services/stage.js');
const docs = require('../services/docs.js');
const enterprises = require('../services/enterprises.js');
const cases = require('../services/cases.js');
const caseTypes = require('../services/case-types.js');
const validation = require('../services/validation.js');

async function guard(user, caseId) {
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!k) { const e = new Error('案件不存在'); e.code = 'NOT_FOUND'; throw e; }
  if (!(await auth.canAccess(user, k.enterprise_id))) {
    const e = new Error('无权访问该案件'); e.code = 'FORBIDDEN'; throw e;
  }
  return k;
}

/** 写操作：除可访问外，还要求对目标企业有写权限（企业 owner / 机构 write 授权 / 运营） */
async function guardWrite(user, caseId) {
  const k = await guard(user, caseId);
  if (!(await auth.canWrite(user, k.enterprise_id))) {
    const e = new Error('当前账号对该企业只有查看权限'); e.code = 'FORBIDDEN'; throw e;
  }
  return k;
}

function levelLabel(level) {
  return rules.LEVELS[level] ? rules.LEVELS[level].label : level;
}

module.exports = function register(r) {
  // 事项类型清单：含支持等级、受理机关、官方入口与参考材料
  r.get('/api/case-types', async () => ({ items: caseTypes.list() }), { auth: true });

  // 企业列表
  r.get('/api/enterprises', async ({ user }) => ({ items: await auth.enterprisesOf(user) }), { auth: true });

  r.post('/api/enterprises', async ({user,body,ip}) => ({enterprise: await enterprises.create(user,body,ip)}), {auth:true});
  r.patch('/api/enterprises/:id', async ({user,params,body,ip}) => ({enterprise: await enterprises.update(user,Number(params.id),body,ip)}), {auth:true});
  r.post('/api/enterprises/:id/cases', async ({user,params,body,ip}) => ({case: await cases.create(user,Number(params.id),body,ip)}), {auth:true});

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
      todoCount: Number((await db.one("SELECT COUNT(*) AS n FROM tasks t JOIN cases k ON k.id=t.case_id WHERE k.enterprise_id=? AND t.status<>'done'",[id])).n),
      timeline: await db.all('SELECT t.* FROM timeline_events t JOIN cases k ON k.id=t.case_id WHERE k.enterprise_id=? ORDER BY t.at DESC,t.id DESC LIMIT 6',[id]),
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
      rule: { ...evald, basis: (evald.basis && evald.basis.length) ? evald.basis : (evald.ruleVersion?[{law:evald.ruleVersion.title,text:evald.ruleVersion.review_note,url:evald.ruleVersion.source_url}]:[]) },
      materialCheck: await docs.summary(params.id),
      diagnosisHistory:await db.all('SELECT id,content,digest,created_at FROM diagnosis_snapshots WHERE case_id=? ORDER BY id DESC LIMIT 10',[params.id]),
      stage: await stage.info(kase),
      docs: Object.entries(built.docs).map(([key, d]) => ({ key, documentKey: key, ...d })),
      channels: (await require('../services/checks').latest(params.id)).channels,
      tasks: await db.all('SELECT * FROM tasks WHERE case_id = ? ORDER BY id', [params.id]),
      taskEvents:await db.all('SELECT ev.* FROM task_events ev JOIN tasks t ON t.id=ev.task_id WHERE t.case_id=? ORDER BY ev.id DESC',[params.id]),
      timeline: await db.all('SELECT * FROM timeline_events WHERE case_id = ? ORDER BY at', [params.id])
    };
  }, { auth: true });

  // 重新诊断
  r.post('/api/cases/:id/diagnose', async ({ user, params, ip }) => {
    await guardWrite(user, params.id);
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
  r.get('/api/cases/:id/docs/:key/versions', async ({ user, params }) => {
    await guard(user, params.id);
    return { items: await docs.versions(params.id, params.key) };
  }, { auth: true });
  r.post('/api/cases/:id/docs/:key/restore', async ({ user, params, body }) => {
    await guardWrite(user, params.id);
    if (!Number.isInteger(body.version) || body.version < 1) throw new Error('请选择有效版本');
    const built = await docs.restore(params.id, params.key, body.version, user.id);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({key,...d})) };
  }, { auth: true });

  r.post('/api/cases/:id/docs/:key', async ({ user, params, body, ip }) => {
    await guardWrite(user, params.id);
    const built = await docs.save(params.id, params.key, String(body.html || ''), { source: body.source || 'manual', userId: user.id });
    await auth.audit(user.id, 'doc_save', `${params.id}/${params.key}`, body.source || 'manual', ip);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({ key, ...d })) };
  }, { auth: true });

  // 恢复模板
  r.post('/api/cases/:id/docs/:key/reset', async ({ user, params }) => {
    await guardWrite(user, params.id);
    const built = await docs.reset(params.id, params.key, user.id);
    return { docs: Object.entries(built.docs).map(([key, d]) => ({ key, ...d })) };
  }, { auth: true });

  // 一致性校验
  r.post('/api/cases/:id/doc-check', async ({ user, params,body }) => {
    await guardWrite(user, params.id);
    return { check: await docs.check(params.id,body.key||undefined) };
  }, { auth: true });

  r.patch('/api/tasks/:id',async({user,params,body})=>({task:await require('../services/tasks').update(user,Number(params.id),body)}),{auth:true});
  r.post('/api/tasks/:id/status',async({user,params,body})=>({task:await require('../services/tasks').update(user,Number(params.id),body)}),{auth:true});

  // 补充/修正案件事实：义务履行、整改、无新增同类失信
  r.patch('/api/cases/:id/facts', async ({ user, params, body, ip }) => {
    const kase = await guardWrite(user, params.id);
    const f = validation.facts(body, kase);
    for (const key of ['obligation_at','rectify_at','removed_date']) {
      if (f[key] && kase.listed_date && f[key] < kase.listed_date) throw new Error('履行、整改或移出日期不能早于列入日期');
    }
    await db.tx(async t => {
      await t.run('UPDATE cases SET obligation_at=?,rectified=?,rectify_at=?,no_new_similar=?,removed_date=?,fine_amount=?,discretion=?,facts_updated_at=NOW() WHERE id=?',
        [f.obligation_at,f.rectified,f.rectify_at,f.no_new_similar,f.removed_date,f.fine_amount,f.discretion,params.id]);
      await t.run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?, NOW(), ?, ?, ?)',
        [params.id,user.name || '企业','更新案件事实','事实已更新，请重新诊断并核对已生成材料']);
      await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'facts',?,?,?)",[user.id,params.id,'更新履行/整改/裁量阶次事实',ip||null]);
    });
    const today = new Date().toISOString().slice(0, 10);
    const fresh = await db.one('SELECT * FROM cases WHERE id = ?', [params.id]);
    const evald = await rules.evaluate(fresh, today);
    return { case: fresh, rule: { ...evald, basis: diagnose.BASIS[kase.type] || diagnose.BASIS.penalty } };
  }, { auth: true });

  // 推进案件阶段
  r.post('/api/cases/:id/stage', async ({ user, params, body, ip }) => {
    await guardWrite(user, params.id);
    const r2 = await stage.advance(params.id, String(body.to || ''), { user, note: body.note, evidenceId:body.evidence_id, ip });
    const fresh = await db.one('SELECT * FROM cases WHERE id = ?', [params.id]);
    return { ...r2, stage: await stage.info(fresh) };
  }, { auth: true });
};
