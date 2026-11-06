'use strict';
const db=require('../db'),auth=require('../services/auth'),v=require('../services/validation');
async function owner(user,id){
 if(user.role==='admin')return;
 if(!await db.one("SELECT 1 FROM enterprise_members WHERE enterprise_id=? AND user_id=? AND role='owner' AND revoked_at IS NULL",[id,user.id]))throw v.forbidden('仅企业负责人可以管理成员和机构授权');
}
async function orgOwner(user,id){
 if(user.role==='admin')return;
 if(!await db.one("SELECT 1 FROM org_members WHERE org_id=? AND user_id=? AND role='owner'",[id,user.id]))throw v.forbidden('需要机构负责人权限');
}
module.exports=function(r){
 r.get('/api/enterprises/:id/collaboration',async({user,params})=>{
  await owner(user,params.id);
  return {members:await db.all('SELECT m.*,u.name,u.phone FROM enterprise_members m JOIN users u ON u.id=m.user_id WHERE enterprise_id=?',[params.id]),grants:await db.all('SELECT g.*,o.name FROM org_enterprises g JOIN orgs o ON o.id=g.org_id WHERE enterprise_id=?',[params.id]),orgs:await db.all("SELECT id,name,type FROM orgs WHERE status='active'")};
 },{auth:true});
 r.post('/api/enterprises/:id/members',async({user,params,body,ip})=>{
  await owner(user,params.id);const u=await db.one("SELECT id FROM users WHERE phone=? AND status='active'",[body.phone]);if(!u)throw new Error('请先让成员注册账号');
  const existing=await db.one('SELECT role FROM enterprise_members WHERE enterprise_id=? AND user_id=?',[params.id,u.id]);if(existing?.role==='owner')throw new Error('负责人不能通过成员操作移除或降权');
  await db.tx(async t=>{
   await t.run("INSERT INTO enterprise_members (enterprise_id,user_id,role,revoked_at) VALUES (?,?,'staff',?) ON DUPLICATE KEY UPDATE revoked_at=VALUES(revoked_at),granted_at=NOW()",[params.id,u.id,body.revoked?new Date():null]);
   await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'enterprise_member',?,?,?)",[user.id,String(params.id),`${body.revoked?'撤销':'添加'}只读成员 #${u.id}`,ip||null]);
  });return {updated:true};
 },{auth:true});
 r.post('/api/enterprises/:id/grants',async({user,params,body,ip})=>{
  await owner(user,params.id);if(!['read','write'].includes(body.perm))throw new Error('请选择只读或协作权限');
  const note=v.text(body.note,'授权说明',200,true);if(!await db.one("SELECT id FROM orgs WHERE id=? AND status='active'",[body.org_id]))throw new Error('机构不存在或已停用');
  await db.tx(async t=>{
   await t.run('INSERT INTO org_enterprises (org_id,enterprise_id,perm,note,revoked_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE perm=VALUES(perm),note=VALUES(note),revoked_at=VALUES(revoked_at),granted_at=NOW()',[body.org_id,params.id,body.perm,note,body.revoked?new Date():null]);
   await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'org_grant',?,?,?)",[user.id,String(params.id),`${body.revoked?'撤销':'授予'}机构 #${body.org_id} ${body.perm}：${note}`,ip||null]);
  });return {updated:true};
 },{auth:true});
 r.post('/api/admin/orgs',async({user,body})=>{
  if(user.role!=='admin')throw v.forbidden('需要平台运营权限');
  const name=v.text(body.name,'机构名称',200,true);if(!['park','agency','bank'].includes(body.type))throw new Error('机构类型不正确');
  const u=await db.one("SELECT * FROM users WHERE phone=? AND status='active'",[body.owner_phone]);if(!u||u.role==='admin')throw new Error('请指定已注册的普通或机构账号为负责人');
  const id=await db.tx(async t=>{
   const out=await t.run('INSERT INTO orgs (name,type) VALUES (?,?)',[name,body.type]);
   await t.run("INSERT INTO org_members (org_id,user_id,role) VALUES (?,?,'owner')",[out.insertId,u.id]);
   await t.run("UPDATE users SET role='org' WHERE id=?",[u.id]);
   await t.run("INSERT INTO audit_logs (actor_id,action,target,detail) VALUES (?,'org_create',?,?)",[user.id,String(out.insertId),name]);return out.insertId;
  });return {org:await db.one('SELECT * FROM orgs WHERE id=?',[id])};
 },{auth:true});
 r.get('/api/org/workspace',async({user})=>{
  if(!['org','admin'].includes(user.role))throw v.forbidden('需要机构账号');
  const orgs=user.role==='admin'?await db.all('SELECT * FROM orgs'):await db.all('SELECT o.*,m.role AS member_role FROM orgs o JOIN org_members m ON m.org_id=o.id WHERE m.user_id=?',[user.id]);
  const enterprises=await auth.enterprisesOf(user),cases=[];
  for(const e of enterprises){cases.push(...await db.all("SELECT k.*,e.name AS enterprise_name,(SELECT COUNT(*) FROM tasks t WHERE t.case_id=k.id AND t.status<>'done' AND t.due_date<CURDATE()) AS overdue FROM cases k JOIN enterprises e ON e.id=k.enterprise_id WHERE k.enterprise_id=?",[e.id]));}
  return {orgs,enterprises,cases};
 },{auth:true});
 r.get('/api/orgs/:id/members',async({user,params})=>{
  await orgOwner(user,params.id);return {items:await db.all('SELECT m.*,u.name,u.phone FROM org_members m JOIN users u ON u.id=m.user_id WHERE org_id=?',[params.id])};
 },{auth:true});
 r.post('/api/orgs/:id/members',async({user,params,body,ip})=>{
  await orgOwner(user,params.id);
  const u=await db.one("SELECT * FROM users WHERE phone=? AND status='active'",[body.phone]);
  if(!u||u.role==='admin')throw new Error('请选择已注册的普通或机构账号');
  const old=await db.one('SELECT * FROM org_members WHERE org_id=? AND user_id=?',[params.id,u.id]);if(old?.role==='owner')throw new Error('不能移除机构负责人');
  if(user.role!=='admin'&&u.role!=='org')throw new Error('该账号须先由运营人员确认为机构账号');
  await db.tx(async t=>{
   if(body.revoked)await t.run('DELETE FROM org_members WHERE org_id=? AND user_id=?',[params.id,u.id]);
   else {if(user.role==='admin')await t.run("UPDATE users SET role='org' WHERE id=?",[u.id]);await t.run("INSERT IGNORE INTO org_members (org_id,user_id,role) VALUES (?,?,'member')",[params.id,u.id]);}
   await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'org_member',?,?,?)",[user.id,String(params.id),`${body.revoked?'移除':'添加'}成员 #${u.id}`,ip||null]);
  });return {updated:true};
 },{auth:true});
 r.post('/api/org/batch-monitor',async({user,body})=>{
  if(!['org','admin'].includes(user.role))throw v.forbidden('需要机构账号');
  if(!Array.isArray(body.case_ids)||!body.case_ids.length||body.case_ids.length>30||body.case_ids.some(id=>typeof id!=='string'))throw new Error('每批请选择 1 至 30 个事项');
  const results=[];
  for(const id of [...new Set(body.case_ids)]){try{
   const k=await db.one('SELECT * FROM cases WHERE id=?',[id]);if(!k||!await auth.canWrite(user,k.enterprise_id))throw new Error('事项不存在或无协作权限');
   results.push({id,ok:true,result:await require('../services/checks').rescan(id,'batch')});
  }catch(e){results.push({id,ok:false,error:e.message})}}
  await auth.audit(user.id,'batch_monitor','cases',`${results.filter(r=>r.ok).length}/${results.length}`);return {results};
 },{auth:true});
};
