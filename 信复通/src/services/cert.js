'use strict';
const db=require('../db'),config=require('../config'),{sha256,hmac,stable}=require('../crypto'),{randomBytes,timingSafeEqual}=require('node:crypto');
const evidence=require('./evidence'),v=require('./validation');
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const metadata=(c,version)=>({code:c.code,caseId:c.case_id,docNo:c.doc_no||'',digest:c.digest,prevHash:c.prev_hash,issuedAt:c.issued_at,validUntil:c.valid_until,version});
const signature=(c,version)=>hmac(stable(metadata(c,version)),config.signKey);
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
async function issue(caseId,{months=12}={}){
  if(!Number.isInteger(months)||months<1||months>12)throw new Error('有效期须为1至12个月');
  return db.tx(async t=>{
    const k=await t.one('SELECT * FROM cases WHERE id=? FOR UPDATE',[caseId]);if(!k)throw new Error('事项不存在');
    const proof=await evidence.official(caseId,t);
    if(k.stage!=='repaired'||!proof||!k.removed_date)throw new Error('须登记已修复、移出日期，并保留已人工核录的官方结果材料，方可生成办理进度记录');
    const bytes=await t.one('SELECT content FROM evidence_files WHERE id=?',[proof.id]);
    if(require('node:crypto').createHash('sha256').update(bytes.content).digest('hex')!==proof.digest)throw new Error('官方材料文件与摘要不一致');
    const e=await t.one('SELECT * FROM enterprises WHERE id=?',[k.enterprise_id]);
    const channels=await t.all("SELECT c.channel_code,c.channel_name,c.state,c.last_checked_at,COALESCE(f.provider,'mock') AS provider,f.latest_snapshot FROM case_channels c LEFT JOIN channel_configs f ON f.case_id=c.case_id AND f.channel_code=c.channel_code WHERE c.case_id=? ORDER BY c.channel_code",[caseId]);
    const content={schemaVersion:1,enterprise:{name:e.name,creditCode:e.credit_code},case:{id:k.id,event:k.event,authority:k.authority,docNo:k.doc_no,listedDate:k.listed_date,removedDate:k.removed_date,level:k.level},officialProof:{id:proof.id,digest:proof.digest,source:proof.source,observedAt:proof.observed_at,reviewedAt:proof.reviewed_at,reviewType:'企业人工核录，未经平台向机关联网验证'},channels};
    const digest=sha256(stable(content));
    const last=await t.one('SELECT c.*,s.version,s.content_hash FROM certificates c JOIN certificate_snapshots s ON s.code=c.code WHERE c.case_id=? ORDER BY s.version DESC LIMIT 1',[caseId]);
    const today=new Date().toISOString().slice(0,10);
    if(last&&last.digest===digest&&last.status==='valid'&&last.valid_until>=today&&equal(signature(last,last.version),last.signature))return last;
    const version=(last?.version||0)+1,issuedAt=new Date().toISOString().slice(0,19).replace('T',' ');
    const validUntil=require('./rules').addMonths(today,months);
    const c={code:'XF-C-'+randomBytes(12).toString('hex').toUpperCase(),case_id:caseId,doc_no:k.doc_no||'',digest,prev_hash:last?.digest||'0'.repeat(64),issued_at:issuedAt,valid_until:validUntil};
    await t.run("INSERT INTO certificates (code,case_id,doc_no,digest,prev_hash,signature,issued_at,valid_until,status) VALUES (?,?,?,?,?,?,?,?,'valid')",[c.code,caseId,c.doc_no,digest,c.prev_hash,signature(c,version),issuedAt,validUntil]);
    await t.run('INSERT INTO certificate_snapshots (code,case_id,version,content,content_hash) VALUES (?,?,?,?,?)',[c.code,caseId,version,JSON.stringify(content),digest]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),'平台','生成办理进度记录',?)",[caseId,c.code+' · 版本 '+version]);
    return {...c,status:'valid',version};
  });
}
async function get(code){return db.one('SELECT * FROM certificates WHERE code=?',[code]);}
async function verify(code){
  const c=await get(code);if(!c)return {state:'notfound',message:'未找到该记录编号'};
  const s=await db.one('SELECT * FROM certificate_snapshots WHERE code=?',[code]);
  if(!s)return {state:'legacy',message:'此为旧版演示记录，缺少不可变证据快照，请重新生成'};
  const content=parse(s.content),valid=sha256(stable(content))===c.digest&&c.digest===s.content_hash&&equal(signature(c,s.version),c.signature);
  let state=valid?'valid':'tampered',message=valid?'生成时快照完整，官方材料由企业人工核录；当前渠道状态需重新核验。':'记录内容、核对有效期或签名与生成记录不一致。';
  if(valid&&c.status==='revoked'){state='revoked';message='该记录已作废。';}
  else if(valid&&c.valid_until<new Date().toISOString().slice(0,10)){state='expired';message='该记录已过核对有效期。';}
  const active=await evidence.official(c.case_id);
  if(valid&&state==='valid'&&(!active||active.id!==content.officialProof.id)){state='stale';message='该记录所依据的官方材料已归档或更新，请重新生成。';}
  await db.run('INSERT INTO cert_scans (code,ip,ua,result) VALUES (?,?,?,?)',[code,'','',state]);
  if(!valid)return {state,message,certificate:{code:c.code}};
  return {state,message,certificate:{code:c.code,docNo:c.doc_no,issuedAt:c.issued_at,validUntil:c.valid_until,digest:c.digest,prevHash:c.prev_hash,status:c.status,version:s.version},enterprise:content.enterprise,case:content.case,officialProof:{digest:content.officialProof.digest,observedAt:content.officialProof.observedAt,reviewType:content.officialProof.reviewType},channels:content.channels.map(x=>({name:x.channel_name,state:x.state,provider:x.provider,checkedAt:x.last_checked_at}))};
}
async function revoke(code,reason){reason=v.text(reason,'撤销原因',300,true);if(!await get(code))throw new Error('记录不存在');await db.run("UPDATE certificates SET status='revoked',revoked_reason=?,revoked_at=NOW() WHERE code=?",[reason,code]);return get(code);}
async function listOf(caseId){return db.all('SELECT c.*,s.version FROM certificates c LEFT JOIN certificate_snapshots s ON s.code=c.code WHERE c.case_id=? ORDER BY c.issued_at DESC,s.version DESC',[caseId]);}
module.exports={issue,get,verify,revoke,listOf};
