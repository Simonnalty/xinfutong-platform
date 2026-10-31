'use strict';
const db=require('../db'),cert=require('./cert'),{sha256}=require('../crypto'),{randomUUID,randomBytes}=require('node:crypto'),v=require('./validation');
async function create(caseId,input,user){
 const c=await cert.get(input.code);if(!c||c.case_id!==caseId)throw new Error('请选择当前事项的凭证');
 if((await cert.verify(c.code)).state!=='valid')throw new Error('仅有效的平台状态凭证可以创建分享包');
 if(!['financing','tender'].includes(input.purpose))throw new Error('请选择融资或投标用途');
 if(!Number.isInteger(input.days)||input.days<1||input.days>30)throw new Error('分享有效期须为1至30天');
 const recipient=v.text(input.recipient,'接收单位',200),token=randomBytes(32).toString('hex'),id=randomUUID(),expires=Date.now()+input.days*86400000;
 await db.tx(async t=>{
  await t.run('INSERT INTO purpose_shares (id,case_id,certificate_code,purpose,recipient,token_hash,expires_ts,created_by) VALUES (?,?,?,?,?,?,?,?)',[id,caseId,c.code,input.purpose,recipient,sha256(token),expires,user.id]);
  await t.run("INSERT INTO audit_logs (actor_id,action,target,detail) VALUES (?,'purpose_share_create',?,?)",[user.id,id,input.purpose]);
 });return {...await get(id),token};
}
async function get(id){return db.one('SELECT id,case_id,certificate_code,purpose,recipient,expires_ts,revoked_at,created_at FROM purpose_shares WHERE id=?',[id]);}
async function readRow(row){
 if(!row)return {state:'notfound',message:'未找到该分享包'};
 if(row.revoked_at)return {state:'revoked',message:'企业已撤销此分享包'};
 if(Number(row.expires_ts)<=Date.now())return {state:'expired',message:'分享包已到期，请联系企业重新分享'};
 const verification=await cert.verify(row.certificate_code);
 if(verification.state!=='valid')return {state:verification.state,message:verification.message};
 return {state:'valid',purpose:row.purpose,recipient:row.recipient,expiresAt:new Date(Number(row.expires_ts)).toISOString(),verification,message:'本分享包由企业提供，用于材料核对，不代表银行授信、招标采信或行政机关认证。'};
}
async function read(token){if(!/^[a-f0-9]{64}$/.test(token))return {state:'notfound',message:'分享地址无效'};return readRow(await db.one('SELECT * FROM purpose_shares WHERE token_hash=?',[sha256(token)]));}
async function revoke(id,user){await db.tx(async t=>{await t.run('UPDATE purpose_shares SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=?',[id]);await t.run("INSERT INTO audit_logs (actor_id,action,target) VALUES (?,'purpose_share_revoke',?)",[user.id,id]);});}
module.exports={create,get,read,readRow,revoke};
