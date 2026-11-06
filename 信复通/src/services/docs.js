'use strict';
const db = require('../db.js');
const sanitize = require('sanitize-html');
const {parseDocument}=require('htmlparser2');
const {findAll,textContent}=require('domutils');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = html => sanitize(html, { allowedTags: ['p','br','span','div','h4','h3','strong','b','em','i','u','ol','ul','li','table','thead','tbody','tr','th','td'], allowedAttributes: { span: ['class','data-field'], div: ['class'], p: ['class'] }, allowedClasses: {span:['lock','required'],div:['sign','meta'],p:['no-indent']} });
function cn(value) { if (!value) return ''; const [y,m,d]=String(value).slice(0,10).split('-'); return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`; }
function render(tpl, ctx) {
  const html=String(tpl).replace(/<span class="lock">\s*\{\{(\w+)\}\}\s*<\/span>/g, '<span class="lock" data-field="$1">{{$1}}</span>').replace(/\{\{(\w+)\}\}/g, (_,k) => ctx[k] == null ? '' : ctx[k]);
  let index=0;
  return clean(html.replace(/【待(?:补充|填写|核对)：[^】]*】/g,text=>`<span class="required" data-field="required_${index++}">${text}</span>`));
}
function narrative(k) {
  return {
    cause: '【待补充：请如实说明发生原因，不得编造事实】',
    measure: [k.obligation_at ? `企业登记的义务履行完成日为 ${k.obligation_at}，具体内容以所附证明为准。` : '【待补充：义务履行情况及证明】', k.rectified === 1 ? `企业登记整改已完成${k.rectify_at ? '，登记完成日为 '+k.rectify_at : ''}，具体措施及复查情况以证明为准。` : k.rectified === 0 ? '企业登记整改尚未完成。' : '【待补充：整改措施、完成情况及证明】'].join(''),
    result: k.removed_date ? `企业登记的移出日期为 ${k.removed_date}，应与官方修复结果材料核对。` : '【待补充：办理结果及官方证明，尚未确认修复完成】',
    removedText: k.removed_date ? `企业登记移出日期为 ${k.removed_date}，以官方决定为准。` : '',
    proofName: '义务履行证明、整改证明及官方办理材料（按实际情况提供）'
  };
}
function context(e,k,today) {
  const n=narrative(k);
  return {name:esc(e.name),code:esc(e.credit_code||e.code),legal:esc(e.legal),authority:esc(k.authority),event:esc(k.event),docNo:esc(k.doc_no),listed:k.listed_date||'',listedCN:cn(k.listed_date),removed:k.removed_date||'',removedCN:cn(k.removed_date),cause:esc(n.cause),measure:esc(n.measure),result:esc(n.result),removedText:esc(n.removedText),proofName:esc(n.proofName),agent:'【待填写：受托人】',agentId:'【待填写：受托人证件号码】',count:'【待核对：实际材料份数】',today,todayCN:cn(today),sign:`<div class="sign">${esc(e.name)}（盖章）<br>申请人：${esc(e.name)}<br>${cn(today)}</div>`};
}
async function load(caseId) {
  const k=await db.one('SELECT * FROM cases WHERE id=?',[caseId]); if(!k)throw new Error('事项不存在');
  return {k,e:await db.one('SELECT * FROM enterprises WHERE id=?',[k.enterprise_id])};
}
async function build(caseId,today,{templatesOnly=false}={}) {
  const {e,k}=await load(caseId), day=today||new Date().toISOString().slice(0,10);
  // 是否属于「无需申请/不能提前申请」必须由规则引擎整体判断：
  // 严重失信第八条第三项由处罚种类决定，规则 definition 里并没有 autoStopOnly 标记。
  const ev=await require('./rules').evaluate(k,day);
  const noApplication=Boolean(ev.autoStopOnly);
  const templates=!noApplication&&['penalty','abnormal'].includes(k.type)?await db.all('SELECT t.* FROM doc_templates t JOIN (SELECT doc_key,MAX(version) AS v FROM doc_templates GROUP BY doc_key) latest ON latest.doc_key=t.doc_key AND latest.v=t.version ORDER BY t.id'):[];
  const overrides=templatesOnly?[]:await db.all('SELECT doc_key,html,status,source,version,updated_at FROM case_docs WHERE case_id=?',[caseId]);
  const map=Object.fromEntries(overrides.map(o=>[o.doc_key,o])),ctx=context(e,k,day),docs={};
  for(const t of templates){const o=map[t.doc_key],html=o?clean(o.html):render(t.body,ctx),expected=render(t.body,ctx);
    const want=locks(expected),actual=locks(html);
    const finalized=Boolean(o?.status==='final' && !/\{\{|【待(?:补充|填写|核对)/.test(html) && requiredIssues(expected,html).length===0 && want.length===actual.length && want.every((w,i)=>w.value && actual[i].value===w.value && (!actual[i].field||actual[i].field===w.field)));
    docs[t.doc_key]={title:t.title,version:o?o.version:0,templateVersion:t.version,status:o?o.source:'template',finalized,updatedAt:o?.updated_at||null,html};}
  return {docs,case:k,enterprise:e};
}
const DOC_TITLES={apply:'信用修复申请书',promise:'守信承诺书',rectify:'整改情况说明',auth:'授权委托书',list:'材料目录与证明清单',plan:'整改计划书'};
// Compare every locked slot to its current authoritative template, including count and order.
const locks = html => [...html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)].filter(m=>/class="lock"/.test(m[1])).map(m=>({field:m[1].match(/data-field="(\w+)"/)?.[1],value:m[2].replace(/\s+/g,'')}));
function requiredFields(html){
  return findAll(el=>el.name==='span' && (el.attribs?.class||'').split(/\s+/).includes('required'),parseDocument(html).children)
    .map(el=>({field:el.attribs['data-field'],text:textContent(el)}));
}
function requiredIssues(expected,html){
  const want=requiredFields(expected),actual=requiredFields(html),issues=[];
  for(const w of want){
    const matches=actual.filter(a=>a.field===w.field);
    const label=w.text.replace(/^【待(?:补充|填写|核对)：|】$/g,'');
    if(matches.length!==1)issues.push({type:'required_missing',field:w.field,message:`必填项结构缺失或重复：${label}。请恢复模板后在原填写区域补充，原版本仍保留。`});
    else if(!/[\p{L}\p{N}]/u.test(matches[0].text.replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')))issues.push({type:'required_empty',field:w.field,message:`必填项不能为空：${label}`});
  }
  return issues;
}
async function evaluateCheck(caseId,docKey) {
  const {docs}=await build(caseId), expected=(await build(caseId,undefined,{templatesOnly:true})).docs;
  const issues=[],missing=[];let locked=0;
  if(!Object.keys(docs).length)issues.push({type:'unsupported',message:'当前事项没有可用模板，请核对适用范围'});
  for(const [key,d] of Object.entries(docs)){
    if(docKey && key!==docKey)continue;
    const want=locks(expected[key].html), actual=locks(d.html); locked+=want.length;
    for(let i=0;i<want.length;i++){
      const w=want[i],a=actual[i];
      if(!w.value || !a || a.value!==w.value || (a.field && a.field!==w.field))issues.push({doc:key,field:w.field||`slot_${i}`,type:!w.value?'empty_fact':'fact_changed',message:'锁定事实为空、缺失或与企业档案不一致'});
    }
    if(actual.length!==want.length)issues.push({doc:key,type:'lock_count',message:'锁定字段数量不一致'});
    for(const issue of requiredIssues(expected[key].html,d.html))missing.push({doc:key,...issue});
    if(/\{\{|【待(?:补充|填写|核对)/.test(d.html))missing.push({doc:key,type:'unfinished',message:'尚有待填写内容'});
  }
  if(docKey&&!docs[docKey])throw new Error('文书不存在');
  return {valid:issues.length===0&&missing.length===0,issues,missing,locked,score:Math.max(0,100-issues.length*10-missing.length*5)};
}
async function summary(caseId) {
  return evaluateCheck(caseId);
}
async function check(caseId,docKey) {
  const result=await evaluateCheck(caseId,docKey);
  await db.run('INSERT INTO doc_checks (case_id,result,score) VALUES (?,?,?)',[caseId,JSON.stringify(result),result.score]);return result;
}
async function save(caseId,docKey,html,{source='manual',userId=null}={}) {
  const built=await build(caseId);if(!built.docs[docKey])throw new Error('文书不存在');
  if(typeof html!=='string'||html.length>300000||!html.trim())throw new Error('文书内容须非空且不超过 30 万字符');
  if(!['manual','ai','template','restore'].includes(source))throw new Error('文书来源不正确');
  html=clean(html);
  await db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[caseId]);
    const old=await t.one('SELECT * FROM case_docs WHERE case_id=? AND doc_key=?',[caseId,docKey]);
    const last=await t.one('SELECT MAX(version) AS n FROM doc_versions WHERE case_id=? AND doc_key=?',[caseId,docKey]);
    if(old&&!last.n)await t.run('INSERT INTO doc_versions (case_id,doc_key,version,html,source,created_by) VALUES (?,?,?,?,?,?)',[caseId,docKey,old.version,clean(old.html),old.source,old.updated_by]);
    const version=Math.max(Number(last.n)||0,old?.version||0)+1;
    await t.run('INSERT INTO doc_versions (case_id,doc_key,version,html,source,created_by) VALUES (?,?,?,?,?,?)',[caseId,docKey,version,html,source,userId]);
    await t.run("INSERT INTO case_docs (case_id,doc_key,html,status,source,version,updated_by) VALUES (?,?,?,'draft',?,?,?) ON DUPLICATE KEY UPDATE html=VALUES(html),status='draft',source=VALUES(source),version=VALUES(version),updated_by=VALUES(updated_by)",[caseId,docKey,html,source,version,userId]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'保存文书草稿',?)",[caseId,source==='ai'?'AI':'用户',`${DOC_TITLES[docKey]||docKey} · 版本 ${version} · ${source}`]);
  });return build(caseId);
}
async function finalize(caseId,docKey,version,userId){
  if(!Number.isInteger(version)||version<1)throw new Error('请先保存草稿，再确认定稿');
  await db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[caseId]);
    const current=await t.one('SELECT * FROM case_docs WHERE case_id=? AND doc_key=?',[caseId,docKey]);
    if(!current||current.version!==version)throw new Error('材料版本已变化，请刷新并核对当前草稿');
    const check=await evaluateCheck(caseId,docKey);
    if(!check.valid)throw new Error('材料校验未通过：'+[...check.missing,...check.issues].map(i=>i.message).join('；'));
    await t.run("UPDATE case_docs SET status='final',updated_by=?,updated_at=NOW() WHERE case_id=? AND doc_key=?",[userId,caseId,docKey]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'确认材料定稿',?)",[caseId,'用户',`${DOC_TITLES[docKey]||docKey} · 版本 ${version}`]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail) VALUES (?,'doc_finalize',?,?)",[userId,`${caseId}/${docKey}`,`版本 ${version}`]);
  });
  return build(caseId);
}
async function reset(caseId,docKey,userId=null){const d=(await build(caseId,undefined,{templatesOnly:true})).docs[docKey];if(!d)throw new Error('文书不存在');return save(caseId,docKey,d.html,{source:'template',userId});}
async function versions(caseId,docKey){return db.all('SELECT version,html,source,created_by,created_at FROM doc_versions WHERE case_id=? AND doc_key=? ORDER BY version DESC',[caseId,docKey]);}
async function restore(caseId,docKey,version,userId){const d=await db.one('SELECT html FROM doc_versions WHERE case_id=? AND doc_key=? AND version=?',[caseId,docKey,version]);if(!d)throw new Error('历史版本不存在');return save(caseId,docKey,d.html,{source:'restore',userId});}
module.exports={build,check,summary,save,finalize,reset,versions,restore,load,context,render,cn,esc,clean,DOC_TITLES};
