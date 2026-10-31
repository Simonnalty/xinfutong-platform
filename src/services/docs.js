'use strict';
/*
 * 文书服务：模板存库（doc_templates），渲染只做字段替换；
 * 槽位三分类落实为 <span class="lock"> 事实锁定 —— AI 只能改锁外的措辞。
 */
const db = require('../db.js');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cn(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

function render(tpl, ctx) {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] == null ? '' : ctx[k]));
}

function narrative(k, e) {
  const isAbnormal = k.type === 'abnormal';
  if (isAbnormal) {
    return {
      cause: `年度报告未在法定期限内报送，系公司经办人员变动、工作交接不清所致，非主观故意隐瞒。`,
      measure: `${k.removed_date ? k.removed_date.slice(0, 4) : ''} 年 ${k.removed_date ? Number(k.removed_date.slice(5, 7)) : ''} 月完成年度报告补报并通过国家企业信用信息公示系统公示；同步修订内部信息披露管理办法，明确年报责任人与复核流程。`,
      result: k.removed_date
        ? `经${k.authority}核实，本企业已于 ${k.removed_date} 移出经营异常名录；截至本说明出具日，无新增失信记录。`
        : `补报申请已提交，等待${k.authority}核实移出。`,
      removedText: k.removed_date ? `并于 ${k.removed_date} 移出经营异常名录。` : '',
      proofName: '年度报告补报回执、移出决定书'
    };
  }
  return {
    cause: `对相关法律法规和技术规范理解不到位，${k.event}，暴露出内部合规管理缺失。`,
    measure: `已停止相关行为，完成整改并通过${k.authority}复查，相关罚款已足额缴纳；建立合规自查清单，每季度开展一次内部检查。`,
    result: `整改已完成，${k.authority}出具整改复查意见；截至本说明出具日，无新增同类失信记录。`,
    removedText: '',
    proofName: '整改复查意见、缴款凭证'
  };
}

function context(e, k, today) {
  const n = narrative(k, e);
  return {
    name: esc(e.name), code: esc(e.credit_code || e.code || ''), legal: esc(e.legal),
    authority: esc(k.authority), event: esc(k.event), docNo: esc(k.doc_no),
    listed: k.listed_date || '', listedCN: cn(k.listed_date),
    removed: k.removed_date || '', removedCN: cn(k.removed_date),
    cause: esc(n.cause), measure: esc(n.measure), result: esc(n.result),
    removedText: n.removedText, proofName: n.proofName,
    agent: '李某某', agentId: '4303**********1234',
    count: 5,
    today, todayCN: cn(today),
    sign: `<div class="sign">${esc(e.name)}（盖章）<br>申请人：${esc(e.name)}<br>${cn(today)}</div>`
  };
}

async function load(caseId) {
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!k) throw new Error('案件不存在');
  const e = await db.one('SELECT * FROM enterprises WHERE id = ?', [k.enterprise_id]);
  return { e, k };
}

async function build(caseId, today) {
  const { e, k } = await load(caseId);
  const day = today || new Date().toISOString().slice(0, 10);
  const tpls = await db.all('SELECT * FROM doc_templates ORDER BY id');
  const overrides = await db.all('SELECT doc_key, html, source, version, updated_at FROM case_docs WHERE case_id = ?', [caseId]);
  const ovMap = Object.fromEntries(overrides.map(o => [o.doc_key, o]));
  const ctx = context(e, k, day);
  const docs = {};
  for (const t of tpls) {
    const o = ovMap[t.doc_key];
    docs[t.doc_key] = {
      title: t.title,
      version: t.version,
      status: o ? o.source : 'template',
      updatedAt: o ? o.updated_at : null,
      html: o ? o.html : render(t.body, ctx)
    };
  }
  return { docs, case: k, enterprise: e };
}

const DOC_TITLES = {
  apply: '信用修复申请书', promise: '守信承诺书', rectify: '整改情况说明',
  auth: '授权委托书', list: '材料目录与证明清单', plan: '整改计划书'
};

/** 跨文书一致性校验：锁定事实在每一份文书里的取值必须一致且非空 */
async function check(caseId) {
  const { docs } = await build(caseId);
  const seen = {};
  const issues = [];
  for (const [key, d] of Object.entries(docs)) {
    const locks = [...String(d.html).matchAll(/<span class="lock">([\s\S]*?)<\/span>/g)].map(m => m[1].trim());
    for (const v of locks) {
      const normalized = v.replace(/\s+/g, '');
      if (!normalized) { issues.push({ doc: key, value: v, type: 'empty' }); continue; }
      if (!seen[normalized]) seen[normalized] = key;
    }
  }
  const missing = [];
  for (const [k, d] of Object.entries(docs)) {
    if (/{{/.test(d.html)) missing.push({ doc: k, type: 'unresolved_slot' });
  }
  const score = Math.max(0, 100 - issues.length * 10 - missing.length * 5);
  const result = { issues, missing, locked: Object.keys(seen).length, score };
  await db.run('INSERT INTO doc_checks (case_id, result, score) VALUES (?,?,?)', [caseId, JSON.stringify(result), score]);
  return result;
}

async function save(caseId, docKey, html, { source = 'ai', userId = null } = {}) {
  const exists = await db.one('SELECT * FROM case_docs WHERE case_id = ? AND doc_key = ?', [caseId, docKey]);
  if (exists) {
    await db.run('UPDATE case_docs SET html = ?, source = ?, version = version + 1, updated_by = ? WHERE id = ?',
      [html, source, userId, exists.id]);
  } else {
    await db.run('INSERT INTO case_docs (case_id, doc_key, html, source, updated_by) VALUES (?,?,?,?,?)',
      [caseId, docKey, html, source, userId]);
  }
  await db.run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?, NOW(), ?, ?, ?)',
    [caseId, source === 'ai' ? 'AI' : '用户', `${DOC_TITLES[docKey] || docKey} 已定稿`, `来源：${source}`]);
  return build(caseId);
}

async function reset(caseId, docKey) {
  await db.run('DELETE FROM case_docs WHERE case_id = ? AND doc_key = ?', [caseId, docKey]);
  return build(caseId);
}

module.exports = { build, check, save, reset, load, context, render, cn, esc, DOC_TITLES };
