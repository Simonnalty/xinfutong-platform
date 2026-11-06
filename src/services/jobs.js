'use strict';
const db=require('../db'),{randomUUID}=require('node:crypto');
async function get(caseId){return db.one("SELECT * FROM scheduled_jobs WHERE case_id=? AND kind='monitor'",[caseId]);}
async function configure(caseId,input,user){
  if(typeof input.enabled!=='boolean')throw new Error('请选择启用或暂停');
  const hours=input.interval_hours??24;
  if(!Number.isInteger(hours)||hours<1||hours>168)throw new Error('检查间隔须为 1 至 168 小时');
  await db.tx(async t=>{
    await t.run("INSERT INTO scheduled_jobs (case_id,kind,state,next_at,interval_hours) VALUES (?,'monitor',?,NOW(),?) ON DUPLICATE KEY UPDATE state=VALUES(state),next_at=NOW(),interval_hours=VALUES(interval_hours),attempts=0,lease_until=NULL,lease_token=NULL,last_error=NULL",[caseId,input.enabled?'queued':'paused',hours]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'调整定时监测',?)",[caseId,user.name,input.enabled?`每 ${hours} 小时检查；仅使用已配置数据来源`:'暂停检查']);
  });return get(caseId);
}
async function claim(){
  return db.tx(async t=>{
    const job=await t.one("SELECT * FROM scheduled_jobs WHERE kind='monitor' AND ((state='queued' AND next_at<=NOW()) OR (state='running' AND lease_until<NOW())) ORDER BY next_at,id LIMIT 1 FOR UPDATE");
    if(!job)return null;
    job.lease_token=randomUUID();
    await t.run("UPDATE scheduled_jobs SET state='running',lease_until=DATE_ADD(NOW(),INTERVAL 5 MINUTE),lease_token=? WHERE id=?",[job.lease_token,job.id]);return job;
  });
}
async function tick(scan=require('./checks').rescan){
  const job=await claim();if(!job)return false;
  try{
    const result=await scan(job.case_id,'scheduled');
    if(result.failed)throw new Error('部分渠道获取失败，请查看渠道错误记录');
    await db.run("UPDATE scheduled_jobs SET state='queued',next_at=DATE_ADD(NOW(),INTERVAL interval_hours HOUR),last_run_at=NOW(),attempts=0,last_error=NULL,lease_until=NULL,lease_token=NULL WHERE id=? AND state='running' AND lease_token=?",[job.id,job.lease_token]);
  }catch(e){
    const attempts=Number(job.attempts)+1,minutes=Math.min(60,5*2**Math.min(attempts-1,4));
    await db.run("UPDATE scheduled_jobs SET state=?,next_at=DATE_ADD(NOW(),INTERVAL ? MINUTE),last_run_at=NOW(),attempts=?,last_error=?,lease_until=NULL,lease_token=NULL WHERE id=? AND state='running' AND lease_token=?",[attempts>=5?'failed':'queued',minutes,attempts,String(e.message).slice(0,300),job.id,job.lease_token]);
  }return true;
}
function start(){
  let running=false;
  const run=async()=>{if(running)return;running=true;try{await tick();await require('./compliance').refresh()}catch(e){console.error('[monitor-worker]',e.message)}finally{running=false}};
  const timer=setInterval(run,15000);timer.unref();run();return ()=>clearInterval(timer);
}
module.exports={get,configure,tick,start};
