'use strict';
/*
 * 案件状态机。所有阶段变化必须走这里：
 *  - 只允许 FLOW 里定义的迁移，非法跳转直接拒绝
 *  - 进入「已提交」要求诊断结论为可申请，避免用勾选任务伪造修复结果
 *  - 已修复以人工核录的官方结果材料为依据
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

async function advance(caseId,to,{user,note='',ip,evidenceId}={}) {
  if(typeof note!=='string'||note.length>500)throw fail('处理说明不超过500字');
  const initial=await db.one('SELECT * FROM cases WHERE id=?',[caseId]);
  if(!initial)throw fail('案件不存在','NOT_FOUND');
  if(!FLOW[initial.stage]?.includes(to))throw fail('不允许该阶段变化，请按流程办理');
  if(to==='diagnosed')await diagnose.run(caseId);
  return db.tx(async t=>{
    const kase=await t.one('SELECT * FROM cases WHERE id=? FOR UPDATE',[caseId]),from=kase.stage;
    if(from!==initial.stage||!FLOW[from]?.includes(to))throw fail('事项阶段已变化，请刷新后重试');
    let proof=null;
    if(to==='materials_ready'){
      if(!await t.one('SELECT id FROM diagnoses WHERE case_id=? LIMIT 1',[caseId]))throw fail('请先完成诊断');
      const ev=await rules.evaluate(kase,new Date().toISOString().slice(0,10));
      if(!ev.ruleVersion)throw fail('请先核对适用规则，再确认材料齐备');
      for(const material of ev.materials){if(!(await require('./docs').check(caseId,material.key)).valid)throw fail('材料尚未通过校验：'+material.title);}
    }
    if(to==='submitted'){
      const ev=await rules.evaluate(kase,new Date().toISOString().slice(0,10));
      if(!ev.eligible)throw fail('当前不满足提交条件：'+ev.blockers.map(b=>b.text).join('；'));
    }
    if(['submitted','reviewing','rejected'].includes(to)){
      if(!note.trim())throw fail('请填写实际办理说明');
      proof=await t.one("SELECT * FROM evidence_files WHERE id=? AND case_id=? AND kind='receipt' AND archived=0",[evidenceId||'',caseId]);
      if(!proof)throw fail('请关联本事项有效的提交、受理或退回回执');
    }
    if(to==='repaired'){
      proof=await require('./evidence').official(caseId,t);
      if(!proof)throw fail('请上传官方修复结果并完成人工核录，再登记已修复；平台凭证不能代替官方结果');
      if(!kase.removed_date)throw fail('请先登记官方结果对应的移出日期');
    }
    const progress=PROGRESS[to]??kase.progress;
    await t.run('UPDATE cases SET stage=?,progress=?,closed_at=? WHERE id=?',[to,progress,to==='repaired'?new Date().toISOString().slice(0,19).replace('T',' '):null,caseId]);
    await t.run('INSERT INTO stage_events (case_id,from_stage,to_stage,actor_id,note,evidence_id) VALUES (?,?,?,?,?,?)',[caseId,from,to,user?.id||null,note,proof?.id||null]);
    await t.run('INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,?,?)',[caseId,user?.name||'系统',`状态变更：${LABELS[from]} → ${LABELS[to]}`,(note+(proof?'；依据：'+proof.filename:'')).slice(0,500)]);
    await t.run('INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,?,?,?,?)',[user?.id||null,'stage',caseId,`${from}→${to} ${note}`.slice(0,500),ip||null]);
    return {from,to,label:LABELS[to],progress,allowed:FLOW[to]||[]};
  });
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
