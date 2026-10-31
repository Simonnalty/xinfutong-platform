'use strict';
const db=require('../db'),{sha256,stable}=require('../crypto'),v=require('./validation'),docs=require('./docs'),evidence=require('./evidence');
const CHANNELS={credit_china:'信用中国',gsxt:'国家企业信用信息公示系统',qcc:'企查查',tianyancha:'天眼查',bank:'银行授权核验'};
const CHANNEL_STATE={ok:{label:'已同步'},bad:{label:'未同步'},warn:{label:'信息冲突'},idle:{label:'待核验'},error:{label:'获取失败'}};
const adapters=new Map();
function observe(){return {state:'idle',note:'模拟数据，仅用于功能演示，不能证明真实平台状态'};}
async function latest(caseId){
  const channels=await db.all("SELECT c.*,COALESCE(f.provider,'mock') AS provider,f.latest_snapshot,f.last_error FROM case_channels c LEFT JOIN channel_configs f ON f.case_id=c.case_id AND f.channel_code=c.channel_code WHERE c.case_id=? ORDER BY c.sort",[caseId]);
  return {channels,run:await db.one('SELECT * FROM checks_runs WHERE case_id=? ORDER BY id DESC LIMIT 1',[caseId]),snapshots:await db.all('SELECT * FROM channel_snapshots WHERE case_id=? ORDER BY id DESC LIMIT 30',[caseId])};
}
async function record(caseId,input,user){
  const {k,e}=await docs.load(caseId),code=input.channel;
  if(!CHANNELS[code])throw new Error('请选择支持的渠道');
  if(!CHANNEL_STATE[input.state]||input.state==='error')throw new Error('请选择有效核录状态');
  if(input.credit_code!==e.credit_code || !k.doc_no || input.doc_no!==k.doc_no || input.authority!==k.authority)throw new Error('信用代码、决定文号、机关须与本事项完全一致；缺文号请先补全事项');
  const note=v.text(input.note,'核录说明',300,true),source=v.text(input.source_url,'来源地址',500,true),day=v.date(input.observed_at,'观察日期',true);
  const u=new URL(source);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('来源须为不含登录信息的网页地址');
  if(day>new Date().toISOString().slice(0,10))throw new Error('观察日期不能晚于今天');
  const payload={channel:code,creditCode:e.credit_code,docNo:k.doc_no,authority:k.authority,state:input.state,note,sourceUrl:source,observedAt:day,recordedBy:user.id,provider:'manual'};
  await db.tx(async t=>{
    const snap=await t.run("INSERT INTO channel_snapshots (case_id,channel_code,fetched_at,payload,digest,source) VALUES (?,?,NOW(),?,?,'manual')",[caseId,code,JSON.stringify(payload),sha256(stable(payload))]);
    await t.run('INSERT INTO case_channels (case_id,channel_code,channel_name,state,note,last_checked_at,first_seen_at) VALUES (?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE state=VALUES(state),note=VALUES(note),last_checked_at=NOW()',[caseId,code,CHANNELS[code],input.state,note]);
    await t.run("INSERT INTO channel_configs (case_id,channel_code,provider,latest_snapshot) VALUES (?,?,'manual',?) ON DUPLICATE KEY UPDATE provider='manual',latest_snapshot=VALUES(latest_snapshot),last_error=NULL",[caseId,code,snap.insertId]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'人工核录渠道状态',?)",[caseId,user.name,`${CHANNELS[code]}：${note}`]);
  });return latest(caseId);
}
async function rescan(caseId,trigger='manual'){
  const {k,e}=await docs.load(caseId),{channels}=await latest(caseId);
  let diffs=0;const detail=[];
  const run=await db.run('INSERT INTO checks_runs (case_id,started_at,trigger_by) VALUES (?,NOW(),?)',[caseId,trigger]);
  for(const ch of channels){
    if(ch.provider==='manual'){detail.push({code:ch.channel_code,state:ch.state,provider:'manual',note:'人工核录须重新观察后登记，未自动访问第三方'});continue;}
    let obs,provider=ch.provider;
    try{
      if(provider==='mock')obs=observe();
      else {const adapter=adapters.get(ch.channel_code);if(!adapter)throw new Error('该渠道尚未配置已授权的数据接口');obs=await Promise.race([adapter({enterprise:e,case:k}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('渠道获取超时')),10000);timer.unref();})]);
        if(obs.creditCode!==e.credit_code||obs.docNo!==k.doc_no||obs.authority!==k.authority||!CHANNEL_STATE[obs.state])throw new Error('渠道返回事项不匹配或状态无效');}
    }catch(err){obs={state:'error',note:String(err.message).slice(0,300)};}
    const payload={...obs,provider,creditCode:e.credit_code,docNo:k.doc_no,authority:k.authority},digest=sha256(stable(payload));
    await db.tx(async t=>{
      const snap=await t.run('INSERT INTO channel_snapshots (case_id,channel_code,fetched_at,payload,digest,source,run_id) VALUES (?,?,NOW(),?,?,?,?)',[caseId,ch.channel_code,JSON.stringify(payload),digest,provider,run.insertId]);
      await t.run('UPDATE case_channels SET state=?,note=?,last_checked_at=NOW() WHERE id=?',[obs.state,obs.note,ch.id]);
      await t.run('INSERT INTO channel_configs (case_id,channel_code,provider,latest_snapshot,last_error) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE latest_snapshot=VALUES(latest_snapshot),last_error=VALUES(last_error)',[caseId,ch.channel_code,provider,snap.insertId,obs.state==='error'?obs.note:null]);
    });if(ch.state!==obs.state)diffs++;detail.push({code:ch.channel_code,from:ch.state,to:obs.state,provider});
  }
  await db.run('UPDATE checks_runs SET finished_at=NOW(),diffs=?,digest=? WHERE id=?',[diffs,sha256(JSON.stringify(detail)),run.insertId]);
  return {runId:run.insertId,diffs,channels:detail,failed:detail.some(c=>c.to==='error')};
}
async function basis(caseId,code){
  const {k,e}=await docs.load(caseId),proof=await evidence.official(caseId),{channels}=await latest(caseId),ch=channels.find(c=>c.channel_code===code);
  if(!proof)throw new Error('请先上传并人工核录官方修复结果');
  if(!ch||ch.provider==='mock'||!['bad','warn'].includes(ch.state)||!ch.latest_snapshot)throw new Error('异议需要真实来源的未同步或冲突快照，模拟结果不能作为依据');
  const snap=await db.one('SELECT * FROM channel_snapshots WHERE id=?',[ch.latest_snapshot]);
  const payload=typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
  if(payload.creditCode!==e.credit_code||payload.docNo!==k.doc_no||payload.authority!==k.authority)throw new Error('事项事实已变化，请重新核录渠道');
  if(sha256(stable(payload))!==snap.digest)throw new Error('渠道快照摘要不一致，请重新核录');
  return {k,e,proof,ch,snap,payload};
}
async function objectionHtml(caseId,code){
  const {k,e,proof,ch,payload}=await basis(caseId,code),esc=docs.esc;
  return `<h4>数据异议与更正函（待提交草稿）</h4><p>致：${esc(ch.channel_name)}</p><p>申请企业：${esc(e.name)}，统一社会信用代码：${esc(e.credit_code)}。</p><p>请核对事项：${esc(k.event)}；决定文号：${esc(k.doc_no)}；作出机关：${esc(k.authority)}。</p><p>企业提供并人工核录的官方材料为「${esc(proof.filename)}」，材料日期 ${esc(proof.observed_at)}，摘要 ${proof.digest}。</p><p>企业于 ${esc(payload.observedAt||'快照记录时间')} 在 ${esc(payload.sourceUrl||'授权接口')} 观察到：${esc(ch.note)}。请结合所附官方材料核实是否存在信息更新不一致，并按贵平台纠错流程处理、告知结果。</p><p>附件目录：官方修复结果材料、上述渠道核录记录。处理期限以适用规则和平台受理答复为准。</p><div class="sign">${esc(e.name)}（确认后签章）<br>${docs.cn(new Date().toISOString().slice(0,10))}</div>`;
}
async function createObjection(caseId,code,bodyHtml,user){
  if(bodyHtml)throw new Error('请先生成草稿，再通过编辑接口保存');
  return db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[caseId]);
    const b=await basis(caseId,code),html=await objectionHtml(caseId,code);
    const r=await t.run("INSERT INTO objections (case_id,channel_code,body_html,status) VALUES (?,?,?,'draft')",[caseId,code,html]);
    await t.run('INSERT INTO objection_revisions (objection_id,version,body_html,note,actor_id) VALUES (?,1,?,?,?)',[r.insertId,html,'生成初稿',user?.id||null]);
    await t.run("INSERT INTO objection_events (objection_id,status,note,evidence_id,snapshot_id,actor_id) VALUES (?,'draft','生成草稿，未实际投递',?,?,?)",[r.insertId,b.proof.id,b.snap.id,user?.id||null]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'生成异议函草稿',?)",[caseId,user?.name||'用户',b.ch.channel_name+'；待企业自行提交']);return {id:r.insertId,html,status:'draft'};
  });
}
async function transition(id,input,user){
  const row=await db.one('SELECT * FROM objections WHERE id=?',[id]);if(!row)throw new Error('异议不存在');
  await evidence.guard(user,row.case_id,true);
  const flow={draft:['ready'],ready:['submitted'],submitted:['replied'],replied:['resolved'],sent:['replied']};
  // Direct draft submission is allowed when the actual receipt has been registered.
  if(row.status==='draft')flow.draft.push('submitted');
  if(!flow[row.status]?.includes(input.to))throw new Error('不允许该异议状态变化');
  const note=v.text(input.note,'处理说明',500,true);
  let proof=null;
  if(['submitted','replied'].includes(input.to)){
    proof=await evidence.get(user,input.evidence_id,true);
    if(proof.case_id!==row.case_id||proof.archived||proof.kind!=='receipt')throw new Error('请关联本事项有效的提交或答复回执');
  }
  if(input.to==='resolved'){
    const c=(await latest(row.case_id)).channels.find(c=>c.channel_code===row.channel_code);
    if(!c||c.state!=='ok'||c.provider==='mock')throw new Error('请先重新核录或核验渠道已更新，再关闭异议');
    const last=await db.one('SELECT created_at FROM objection_events WHERE objection_id=? AND status=\'replied\' ORDER BY id DESC LIMIT 1',[id]);
    if(!last||c.last_checked_at<last.created_at)throw new Error('须在答复之后重新核验渠道');
  }
  await db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[row.case_id]);
    const current=await t.one('SELECT status FROM objections WHERE id=? FOR UPDATE',[id]);
    if(current.status!==row.status)throw new Error('异议已变化，请刷新');
    if(['ready','submitted'].includes(input.to))await basis(row.case_id,row.channel_code);
    if(proof){const fresh=await t.one("SELECT id FROM evidence_files WHERE id=? AND case_id=? AND kind='receipt' AND archived=0",[proof.id,row.case_id]);if(!fresh)throw new Error('关联回执已归档，请重新选择');}
    const r=await t.run('UPDATE objections SET status=?,sent_at=IF(?=\'submitted\',NOW(),sent_at),reply_at=IF(?=\'replied\',NOW(),reply_at) WHERE id=? AND status=?',[input.to,input.to,input.to,id,row.status]);
    if(!r.affectedRows)throw new Error('异议已变化，请刷新');
    await t.run('INSERT INTO objection_events (objection_id,status,note,evidence_id,actor_id) VALUES (?,?,?,?,?)',[id,input.to,note,proof?.id||null,user.id]);
  });return db.one('SELECT * FROM objections WHERE id=?',[id]);
}
async function supplement(id,input,user){
 const row=await db.one('SELECT * FROM objections WHERE id=?',[id]);if(!row)throw new Error('异议不存在');
 await evidence.guard(user,row.case_id,true);const note=v.text(input.note,'补充说明',2000,true);
 return db.tx(async t=>{
  await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[row.case_id]);
  const current=await t.one('SELECT * FROM objections WHERE id=? FOR UPDATE',[id]);
  if(!['draft','ready'].includes(current.status))throw new Error('已提交的函件不能修改，请保留投递版本');
  let original=await t.one('SELECT * FROM objection_revisions WHERE objection_id=? ORDER BY version LIMIT 1',[id]);
  if(!original){await t.run('INSERT INTO objection_revisions (objection_id,version,body_html,note,actor_id) VALUES (?,1,?,?,?)',[id,current.body_html,'保留原稿',user.id]);original={body_html:current.body_html};}
  const last=await t.one('SELECT MAX(version) AS version FROM objection_revisions WHERE objection_id=?',[id]);
  const html=original.body_html+'<h4>企业补充说明</h4><p>'+docs.esc(note).replace(/\n/g,'<br>')+'</p>';
  await t.run('INSERT INTO objection_revisions (objection_id,version,body_html,note,actor_id) VALUES (?,?,?,?,?)',[id,last.version+1,html,note,user.id]);
  await t.run('UPDATE objections SET body_html=? WHERE id=?',[html,id]);
  await t.run('INSERT INTO objection_events (objection_id,status,note,actor_id) VALUES (?,?,?,?)',[id,current.status,'保存补充说明，保留原始事实与版本',user.id]);
  return {...current,body_html:html};
 });
}
async function followup(id,input,user){
 const row=await db.one('SELECT * FROM objections WHERE id=?',[id]);if(!row)throw new Error('异议不存在');await evidence.guard(user,row.case_id,true);
 const day=v.date(input.date,'催办提醒日期');
 return db.tx(async t=>{
  await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[row.case_id]);
  const current=await t.one('SELECT * FROM objections WHERE id=? FOR UPDATE',[id]);
  if(!['submitted','sent','replied'].includes(current.status))throw new Error('仅已提交或答复的异议可设催办提醒');
  await t.run('INSERT INTO objection_followups (objection_id,remind_date) VALUES (?,?) ON DUPLICATE KEY UPDATE remind_date=VALUES(remind_date)',[id,day]);
  await t.run('INSERT INTO objection_events (objection_id,status,note,actor_id) VALUES (?,?,?,?)',[id,current.status,day?'企业设定催办提醒：'+day:'取消催办提醒',user.id]);
  return {remind_date:day};
 });
}
module.exports={supplement,followup,rescan,latest,record,objectionHtml,createObjection,transition,observe,CHANNEL_STATE,CHANNELS,adapters};
