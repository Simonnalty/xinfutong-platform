'use strict';
const { randomUUID }=require('node:crypto');
const db=require('../db');
const auth=require('./auth');
const v=require('./validation');
const caseTypes=require('./case-types');
async function create(user,enterpriseId,input,ip) {
  if (!await auth.canWrite(user,enterpriseId)) throw v.forbidden('无权为该企业建立事项');
  if (!caseTypes.exists(input.type)) throw new Error('请选择有效事项类型');
  if (!['minor','general','serious','severe'].includes(input.level)) throw new Error('请选择有效事项等级');
  const event=v.text(input.event,'事项描述',500,true),authority=v.text(input.authority,'主管机关',200,true),docNo=v.text(input.doc_no,'决定文号',120);
  const listed=v.date(input.listed_date,'列入/决定日期',true),due=v.date(input.due_date,'办理截止日期');
  const facts=v.facts(input);
  if (due && due<listed) throw new Error('办理截止日期不能早于列入日期');
  for (const key of ['obligation_at','rectify_at','removed_date']) if(facts[key] && facts[key]<listed) throw new Error('履行、整改或移出日期不能早于列入日期');
  const id='XF-'+randomUUID();
  return db.tx(async t=>{
    const ent=await t.one('SELECT id FROM enterprises WHERE id=?',[enterpriseId]);
    if (!ent) throw Object.assign(new Error('企业不存在'),{code:'NOT_FOUND'});
    await t.run('INSERT INTO cases (id,enterprise_id,type,event,authority,doc_no,listed_date,level,due_date,obligation_at,rectified,rectify_at,no_new_similar,removed_date,fine_amount,discretion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,enterpriseId,input.type,event,authority,docNo,listed,input.level,due,facts.obligation_at,facts.rectified,facts.rectify_at,facts.no_new_similar,facts.removed_date,facts.fine_amount,facts.discretion]);
    for (const name of ['补全履行与整改事实','整理证明附件','诊断并核对申请材料','登记办理回执与官方结果']) await t.run('INSERT INTO tasks (case_id,name,owner,due_date) VALUES (?,?,?,?)',[id,name,user.name||'',due]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'建立修复事项',?)",[id,user.name||'企业负责人',event]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'case_create',?,?,?)",[user.id,id,'企业 '+enterpriseId,ip||null]);
    return t.one('SELECT * FROM cases WHERE id=?',[id]);
  });
}
module.exports={create};
