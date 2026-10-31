'use strict';
const db=require('../db'),auth=require('../services/auth'),v=require('../services/validation'),shares=require('../services/shares'),docs=require('../services/docs'),pdf=require('../services/pdf');
async function guard(user,caseId,write=false){const k=await db.one('SELECT * FROM cases WHERE id=?',[caseId]);if(!k)throw new Error('事项不存在');if(!await auth[write?'canWrite':'canAccess'](user,k.enterprise_id))throw v.forbidden('无权访问该事项');}
module.exports=r=>{
 r.post('/api/cases/:id/shares',async({user,params,body})=>{await guard(user,params.id,true);return {share:await shares.create(params.id,body,user)}},{auth:true});
 r.get('/api/cases/:id/shares',async({user,params})=>{await guard(user,params.id);return {items:await db.all('SELECT id,case_id,certificate_code,purpose,recipient,expires_ts,revoked_at,created_at FROM purpose_shares WHERE case_id=? ORDER BY created_at DESC',[params.id])}},{auth:true});
 r.get('/api/share/:token',async({params,res})=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');return {result:await shares.read(params.token)}});
 r.get('/api/share-file/:id',async({params,res})=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');return {result:await shares.readRow(await shares.get(params.id))}});
 r.post('/api/shares/:id/revoke',async({user,params})=>{const s=await shares.get(params.id);if(!s)throw new Error('分享包不存在');await guard(user,s.case_id,true);await shares.revoke(s.id,user);return {revoked:true}},{auth:true});
 r.get('/api/shares/:id/pdf',async({user,params,res})=>{
  const s=await shares.get(params.id);if(!s)throw new Error('分享包不存在');await guard(user,s.case_id);
  const result=await shares.readRow(s);if(result.state!=='valid')throw new Error(result.message);
  const verify=result.verification,esc=docs.esc;
  // 随机UUID同样作为分享能力地址，二维码受分享包到期与撤销状态约束。
  const qrUrl=require('../config').publicBaseUrl+'/share?file='+encodeURIComponent(s.id);
  const files=await db.all('SELECT filename,kind,observed_at,digest,review_status FROM evidence_files WHERE case_id=? AND archived=0 ORDER BY created_at',[s.case_id]);
  const snapshot=await db.one('SELECT content,created_at FROM diagnosis_snapshots WHERE case_id=? ORDER BY id DESC LIMIT 1',[s.case_id]);
  const diagnosis=snapshot?(typeof snapshot.content==='string'?JSON.parse(snapshot.content):snapshot.content):null;
  const appendix='<h4>企业所存材料目录</h4>'+files.map((f,i)=>`<p>${i+1}. ${esc(f.filename)}；类型 ${esc(f.kind)}；材料日期 ${esc(f.observed_at)}；${f.review_status==='reviewed'?'人工已核录':'待核录'}；摘要 ${f.digest}。</p>`).join('')+(diagnosis?`<h4>历史诊断记录</h4><p>生成时间：${esc(snapshot.created_at)}；当时状态：${esc(diagnosis.result.status)}。这是历史事实与规则快照，后续变化请重新诊断；该记录不代表当前官方认定。</p>`:'<p>尚无已保存的诊断记录。</p>');
  const html=`<p>用途：${s.purpose==='financing'?'融资材料核对':'投标材料核对'}；接收单位：${esc(s.recipient||'未指定')}。</p><p>企业：${esc(verify.enterprise.name)}；统一社会信用代码：${esc(verify.enterprise.creditCode)}。</p><p>事项：${esc(verify.case.event)}；决定机关：${esc(verify.case.authority)}；决定文号：${esc(verify.case.docNo)}；企业登记移出日期：${esc(verify.case.removedDate)}。</p><p>办理进度记录编号：${esc(s.certificate_code)}；生成时材料摘要：${verify.certificate.digest}。</p><p>分享包到期时间：${esc(result.expiresAt)}。扫码页面同时核对分享包授权状态和办理进度记录有效状态。</p><p>${esc(result.message)} 官方结果材料由企业提供并人工核录，未经平台向机关联网验证。</p>`;
  const buffer=await pdf({title:s.purpose==='financing'?'融资用途材料说明':'投标用途材料说明',html:html+appendix,docNo:s.id,qrUrl,footer:'信复通 · 企业授权材料说明',seal:false});
  require('../http').sendBuffer(res,buffer,'application/pdf','用途材料说明.pdf');return {__raw:true};
 },{auth:true});
};
