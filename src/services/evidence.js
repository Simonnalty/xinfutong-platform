'use strict';
const {randomUUID,createHash}=require('node:crypto');
const db=require('../db');
const auth=require('./auth');
const v=require('./validation');
const META='id,case_id,kind,filename,media_type,byte_size,digest,source,observed_at,uploaded_by,review_status,reviewed_by,reviewed_at,review_note,archived,archived_at,created_at';
const KINDS={payment:'缴款或履行证明',rectification:'整改材料',receipt:'办理回执',official_result:'官方修复结果',other:'其他证明'};
async function guard(user,caseId,write=false) {
  const k=await db.one('SELECT * FROM cases WHERE id=?',[caseId]);
  if(!k)throw Object.assign(new Error('事项不存在'),{code:'NOT_FOUND'});
  if(!await auth.canAccess(user,k.enterprise_id) || (write && !await auth.canWrite(user,k.enterprise_id)))throw v.forbidden('无权操作该事项附件');
  return k;
}
async function get(user,id,write=false){
  const e=await db.one(`SELECT ${META} FROM evidence_files WHERE id=?`,[id]);
  if(!e)throw Object.assign(new Error('附件不存在'),{code:'NOT_FOUND'});
  await guard(user,e.case_id,write);return e;
}
function decode(input){
  const name=v.text(input.filename,'文件名',200,true);
  if(/[\x00-\x1f/\\]/.test(name))throw new Error('文件名包含非法字符');
  const encoded=v.text(input.data,'文件内容',6*1024*1024,true);
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length%4!==0)throw new Error('文件编码不正确');
  const data=Buffer.from(encoded,'base64');
  if(!data.length || data.length>4*1024*1024)throw new Error('文件须非空且不超过 4 MB');
  const ext=name.split('.').pop().toLowerCase();
  let mime;
  if(ext==='pdf' && data.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
  if(ext==='png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  if(['jpg','jpeg'].includes(ext) && data[0]===255 && data[1]===216 && data[2]===255)mime='image/jpeg';
  if(!mime)throw new Error('仅接受文件内容匹配的 PDF、PNG 或 JPEG');
  return {name,data,mime};
}
async function upload(user,caseId,input,ip){
  await guard(user,caseId,true);
  if(!KINDS[input.kind])throw new Error('请选择有效证据类型');
  const file=decode(input),source=v.text(input.source,'材料来源',500,true),day=v.date(input.observed_at,'材料日期',true);
  const id=randomUUID(),digest=createHash('sha256').update(file.data).digest('hex');
  await db.tx(async t=>{
    await t.run('INSERT INTO evidence_files (id,case_id,kind,filename,media_type,byte_size,content,digest,source,observed_at,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,caseId,input.kind,file.name,file.mime,file.data.length,file.data,digest,source,day,user.id]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'上传证据附件',?)",[caseId,user.name||'用户',`${KINDS[input.kind]}：${file.name}；SHA-256 ${digest}`]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'evidence_upload',?,?,?)",[user.id,id,caseId,ip||null]);
  });return get(user,id);
}
async function review(user,id,note,ip){
  const e=await get(user,id,true);
  if(e.archived)throw new Error('已归档材料不能核录');
  note=v.text(note,'核录说明',500,true);
  await db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[e.case_id]);
    const current=await t.one('SELECT archived FROM evidence_files WHERE id=?',[id]);if(current.archived)throw new Error('已归档材料不能核录');
    await t.run("UPDATE evidence_files SET review_status='reviewed',reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=? AND archived=0",[user.id,note,id]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'人工核录证据',?)",[e.case_id,user.name||'用户',e.filename+'：'+note]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'evidence_review',?,?,?)",[user.id,id,note,ip||null]);
  });return get(user,id);
}
async function archive(user,id,note,ip){
  const e=await get(user,id,true);note=v.text(note,'归档原因',500,true);
  await db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[e.case_id]);
    await t.run('UPDATE evidence_files SET archived=1,archived_at=NOW() WHERE id=?',[id]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'归档证据附件',?)",[e.case_id,user.name||'用户',e.filename+'：'+note]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'evidence_archive',?,?,?)",[user.id,id,note,ip||null]);
  });return get(user,id);
}
async function official(caseId,t=db){return t.one("SELECT id,filename,digest,source,observed_at,reviewed_at,reviewed_by,review_note FROM evidence_files WHERE case_id=? AND kind='official_result' AND review_status='reviewed' AND archived=0 ORDER BY created_at DESC,id DESC LIMIT 1",[caseId]);}
module.exports={guard,get,upload,review,archive,official,META,KINDS};
