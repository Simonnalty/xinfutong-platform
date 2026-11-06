'use strict';
const db=require('../db'),v=require('./validation'),{sha256}=require('../crypto');
async function publish(input,user){
 if(!['policy','guide','case'].includes(input.category))throw new Error('知识分类不正确');
 const title=v.text(input.title,'标题',200,true),body=v.text(input.body,'正文',20000,true),issuer=v.text(input.issuer,'来源单位',100,true),source=v.text(input.source_url,'来源链接',500,true),note=v.text(input.review_note,'复核说明',500);
 let u;try{u=new URL(source)}catch{throw new Error('请填写有效的来源链接')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('来源链接须为公开网页');
 if(!['draft','reviewed'].includes(input.review_status))throw new Error('请选择复核状态');if(input.review_status==='reviewed'&&!note)throw new Error('发布前须填写复核说明');
 const effective=v.date(input.effective_at,'生效日期');
 const id=await db.tx(async t=>{
  const r=await t.run('INSERT INTO knowledge_entries (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[input.category,title,body,source,issuer,effective,input.review_status,note,user.id]);
  await t.run("INSERT INTO audit_logs (actor_id,action,target,detail) VALUES (?,'knowledge_create',?,?)",[user.id,String(r.insertId),`${input.review_status}：${title}`]);return r.insertId;
 });return db.one('SELECT * FROM knowledge_entries WHERE id=?',[id]);
}
async function list(query={}){
 const q=v.text(query.q,'搜索词',100),category=v.text(query.category,'分类',20);
 return db.all("SELECT * FROM knowledge_entries WHERE review_status='reviewed' AND (?='' OR category=?) AND (?='' OR LOCATE(?,title)>0 OR LOCATE(?,body)>0) ORDER BY id DESC LIMIT 100",[category,category,q,q,q]);
}
async function configure(id,input){
 if(typeof input.enabled!=='boolean'||typeof input.policy_updates!=='boolean')throw new Error('提醒设置格式不正确');
 if(!Number.isInteger(input.repeat_days)||input.repeat_days<1||input.repeat_days>90)throw new Error('复查间隔须为1至90天');
 await db.run('INSERT INTO compliance_subscriptions (enterprise_id,enabled,policy_updates,repeat_days,next_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),policy_updates=VALUES(policy_updates),repeat_days=VALUES(repeat_days),next_at=NOW()',[id,input.enabled,input.policy_updates,input.repeat_days]);return settings(id);
}
async function settings(id){return await db.one('SELECT * FROM compliance_subscriptions WHERE enterprise_id=?',[id])||{enabled:0,policy_updates:1,repeat_days:30};}
async function notice(id,kind,key,title,body,source=null,caseId=null){await db.run('INSERT IGNORE INTO compliance_notices (enterprise_id,kind,dedup_key,title,body,source_url,case_id) VALUES (?,?,?,?,?,?,?)',[id,kind,sha256(`${id}:${kind}:${key}`),title,body,source,caseId]);}
async function refresh(){
 const followups=await db.all("SELECT o.id,o.case_id,o.channel_code,k.enterprise_id,f.remind_date FROM objection_followups f JOIN objections o ON o.id=f.objection_id JOIN cases k ON k.id=o.case_id WHERE f.remind_date<=CURDATE() AND o.status IN ('submitted','sent','replied')");
 for(const f of followups)await notice(f.enterprise_id,'objection',`${f.id}:${f.remind_date}`,'异议催办提醒',`异议 #${f.id}（${f.channel_code}）已到企业自行设定的提醒日期 ${f.remind_date}，请核对答复并记录实际处理情况；该日期不是法定处理期限。`,null,f.case_id);
 const subs=await db.all('SELECT * FROM compliance_subscriptions WHERE enabled=1');
 const policies=await db.all("SELECT * FROM knowledge_entries WHERE category='policy' AND review_status='reviewed' ORDER BY id DESC LIMIT 50");
 for(const s of subs){
  if(s.policy_updates)for(const p of policies)await notice(s.enterprise_id,'policy',String(p.id),p.title,`来源：${p.issuer}。适用范围请结合企业具体情况核对。\n${p.body.slice(0,1500)}`,p.source_url);
  const tasks=await db.all("SELECT t.*,k.enterprise_id FROM tasks t JOIN cases k ON k.id=t.case_id WHERE k.enterprise_id=? AND t.status<>'done' AND t.due_date<CURDATE()",[s.enterprise_id]);
  for(const t of tasks)await notice(s.enterprise_id,'overdue',`${t.id}:${t.due_date}`,'任务已逾期：'+t.name,`任务截止日期为 ${t.due_date}，请确认实际办理情况并更新任务状态。`,null,t.case_id);
  const claim=await db.run('UPDATE compliance_subscriptions SET next_at=DATE_ADD(NOW(),INTERVAL repeat_days DAY) WHERE enterprise_id=? AND next_at<=NOW()',[s.enterprise_id]);
  if(claim.affectedRows)await notice(s.enterprise_id,'checkin',String(s.next_at),'企业合规复查提醒','请核对企业信息公示、待办事项与已修复记录的最新状态；有变化时更新事实和依据材料。');
 }
}
async function notices(id,user){return db.all('SELECT n.*,r.read_at FROM compliance_notices n LEFT JOIN notice_receipts r ON r.notice_id=n.id AND r.user_id=? WHERE n.enterprise_id=? ORDER BY n.id DESC LIMIT 100',[user.id,id]);}
module.exports={publish,list,configure,settings,refresh,notices};
