'use strict';
/*
 * 案件状态机。所有阶段变化必须走这里：
 *  - 只允许 FLOW 里定义的迁移，非法跳转直接拒绝
 *  - 进入「已提交」要求诊断结论为可申请，避免用勾选任务伪造修复结果
 *  - 每次迁移写 timeline 与 audit，进度百分比由服务端计算
 */
const db = require('../db.js');
const rules = require('./rules.js');
const diagnose = require('./diagnose.js');

const FLOW = {
  draft: ['diagnosed'],
  diagnosed: ['materials_ready'],
  materials_ready: ['submitted'],
  submitted: ['reviewing'],
  reviewing: ['repaired', 'rejected'],
  rejected: ['materials_ready', 'submitted'],
  repaired: []
};

const LABELS = {
  draft: '草稿', diagnosed: '已诊断', materials_ready: '材料就绪',
  submitted: '已提交', reviewing: '审核中', repaired: '已修复', rejected: '已退回'
};

const PROGRESS = { draft: 0, diagnosed: 20, materials_ready: 45, submitted: 65, reviewing: 80, repaired: 100, rejected: 60 };

function fail(msg, code = 'CONFLICT') { const e = new Error(msg); e.code = code; return e; }

async function advance(caseId, to, { user, note, ip } = {}) {
  const kase = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!kase) throw fail('案件不存在', 'NOT_FOUND');
  const from = kase.stage;
  if (!FLOW[from]) throw fail(`未知阶段：${from}`);
  if (!FLOW[from].includes(to)) {
    throw fail(`不允许从「${LABELS[from] || from}」直接变为「${LABELS[to] || to}」，合法去向：${FLOW[from].map(s => LABELS[s]).join('、') || '无'}`);
  }

  if (to === 'diagnosed') {
    // 进入「已诊断」即运行一次诊断，保证后续材料环节有可回看的依据
    await diagnose.run(caseId);
  }

  if (to === 'materials_ready') {
    const d = await db.one('SELECT id FROM diagnoses WHERE case_id = ? ORDER BY id DESC LIMIT 1', [caseId]);
    if (!d) throw fail('请先完成智能诊断，再准备材料');
  }

  if (to === 'submitted') {
    const today = new Date().toISOString().slice(0, 10);
    const ev = await rules.evaluate(kase, today);
    if (!ev.eligible) {
      const why = ev.blockers.map(b => b.text).join('；') || '条件未满足';
      throw fail(`当前不满足提交条件：${why}`);
    }
  }

  if (to === 'repaired') {
    const cert = await db.one('SELECT code FROM certificates WHERE case_id = ? AND status = \'valid\' LIMIT 1', [caseId]);
    if (!cert) throw fail('请先签发修复凭证，再标记为已修复');
  }

  if (to === 'rejected' && !String(note || '').trim()) throw fail('退回必须填写原因');

  const progress = PROGRESS[to] ?? kase.progress;
  await db.tx(async (t) => {
    await t.run('UPDATE cases SET stage = ?, progress = ?, closed_at = ? WHERE id = ?',
      [to, progress, to === 'repaired' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, caseId]);
    await t.run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?, NOW(), ?, ?, ?)',
      [caseId, user?.name || '系统', `状态变更：${LABELS[from]} → ${LABELS[to]}`, note || '']);
    await t.run('INSERT INTO audit_logs (actor_id, action, target, detail, ip) VALUES (?,?,?,?,?)',
      [user?.id || null, 'stage', caseId, `${from}→${to}${note ? ' ' + note : ''}`, ip || null]);
  });

  return { from, to, label: LABELS[to], progress, allowed: FLOW[to] || [] };
}

async function info(kase) {
  const allowed = FLOW[kase.stage] || [];
  return {
    current: kase.stage,
    label: LABELS[kase.stage] || kase.stage,
    progress: kase.progress,
    allowed: allowed.map(s => ({ to: s, label: LABELS[s] })),
    steps: Object.keys(LABELS).slice(0, 6).map(s => ({ key: s, label: LABELS[s] }))
  };
}

module.exports = { advance, info, FLOW, LABELS, PROGRESS };
