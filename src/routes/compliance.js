'use strict';
const db=require('../db'),auth=require('../services/auth'),v=require('../services/validation'),service=require('../services/compliance');
async function guard(user,id,write=false){if(!await auth[write?'canWrite':'canAccess'](user,id))throw v.forbidden('无权访问或修改该企业');}
module.exports=r=>{
 r.get('/api/kb',async({url})=>({items:await service.list(Object.fromEntries(url.searchParams))}),{auth:true});
 r.get('/api/admin/knowledge',async({user})=>{if(user.role!=='admin')throw v.forbidden('需要运营权限');return {items:await db.all('SELECT * FROM knowledge_entries ORDER BY id DESC LIMIT 200')}},{auth:true});
 r.post('/api/admin/knowledge',async({user,body})=>{if(user.role!=='admin')throw v.forbidden('需要运营权限');return {entry:await service.publish(body,user)}},{auth:true});
 r.get('/api/enterprises/:id/reminders',async({user,params})=>{await guard(user,params.id);return {settings:await service.settings(params.id)}},{auth:true});
 r.post('/api/enterprises/:id/reminders',async({user,params,body})=>{await guard(user,params.id,true);const settings=await service.configure(params.id,body);await auth.audit(user.id,'reminder_config',params.id,body.enabled?'启用站内提醒':'暂停站内提醒');return {settings}},{auth:true});
 r.get('/api/enterprises/:id/notices',async({user,params})=>{await guard(user,params.id);return {items:await service.notices(params.id,user)}},{auth:true});
 r.post('/api/notices/:id/read',async({user,params})=>{const n=await db.one('SELECT * FROM compliance_notices WHERE id=?',[params.id]);if(!n)throw new Error('提醒不存在');await guard(user,n.enterprise_id);await db.run('INSERT IGNORE INTO notice_receipts (notice_id,user_id) VALUES (?,?)',[n.id,user.id]);return {read:true}},{auth:true});
};
