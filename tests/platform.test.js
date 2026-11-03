'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
let isolated, server, base;
before(async () => {
  isolated = await require('./helpers/isolated-db')();
  const router = require('../src/router').createRouter();
  require('../src/routes/auth')(router);
  require('../src/routes/workspace')(router);
  require('../src/routes/sync')(router);
  require('../src/routes/admin')(router);
  if(require('node:fs').existsSync(require('node:path').join(__dirname,'../src/routes/shares.js'))) require('../src/routes/shares')(router);
  if(require('node:fs').existsSync(require('node:path').join(__dirname,'../src/routes/compliance.js'))) require('../src/routes/compliance')(router);
  if(require('node:fs').existsSync(require('node:path').join(__dirname,'../src/routes/collaboration.js'))) require('../src/routes/collaboration')(router);
  if (require('node:fs').existsSync(require('node:path').join(__dirname,'../src/routes/evidence.js'))) require('../src/routes/evidence')(router);
  server = http.createServer(async (req, res) => {
    if (!await router.dispatch(req, res, new URL(req.url, base)) && !res.writableEnded) {
      res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"ok":false}');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (isolated) await isolated.close();
});
async function request(path, method = 'GET', body, cookie = '') {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function account(phone) {
  assert.equal((await request('/api/auth/register', 'POST', { phone, password: 'test-only-987', name: '测试负责人' })).status, 200);
  return (await request('/api/auth/login', 'POST', { phone, password: 'test-only-987' })).cookie;
}
// A real HTTP PATCH must preserve registered facts; the previous router discarded its body.
test('PATCH facts preserves dates and unknown values, rejects malformed facts atomically', async () => {
  const cookie = await account('13900009001');
  const user = await isolated.db.one('SELECT id FROM users WHERE phone = ?', ['13900009001']);
  const e = await isolated.db.run("INSERT INTO enterprises (name, credit_code) VALUES ('事实测试','91430100MA4L000001')");
  await isolated.db.run("INSERT INTO enterprise_members (enterprise_id,user_id,role) VALUES (?,?,'owner')", [e.insertId,user.id]);
  await isolated.db.run("INSERT INTO cases (id,enterprise_id,type,event,level,listed_date) VALUES ('facts-test',?,'penalty','测试','general','2025-01-01')", [e.insertId]);
  const r = await request('/api/cases/facts-test/facts','PATCH',{ obligation_at:'2025-02-01',rectified:1,rectify_at:'2025-02-02',no_new_similar:null },cookie);
  assert.equal(r.status,200);
  assert.equal(r.body.case.obligation_at,'2025-02-01');
  assert.equal(r.body.case.rectified,1);
  const bad = await request('/api/cases/facts-test/facts','PATCH',{ obligation_at:'2025-02-30',rectified:'anything' },cookie);
  assert.equal(bad.status,400);
  const fresh=await isolated.db.one("SELECT * FROM cases WHERE id='facts-test'");
  assert.equal(fresh.obligation_at,'2025-02-01');
  assert.equal(fresh.rectified,1);
});
test('new owner can build enterprise and case, reopen session, and cannot claim or change another enterprise', async () => {
  const owner=await account('13900009002'), other=await account('13900009003');
  const input={name:'新建企业测试',credit_code:'91430100MA4L000019',legal:'测试法人',region:'湖南长沙',contact:'测试联系人',phone:'13900009002'};
  const created=await request('/api/enterprises','POST',input,owner);
  assert.equal(created.status,200);
  const id=created.body.enterprise.id;
  assert.equal((await request('/api/enterprises','GET',undefined,owner)).body.items[0].relation,'owner');
  assert.equal((await request('/api/enterprises','POST',input,other)).status,400);
  assert.equal((await request('/api/enterprises','GET',undefined,other)).body.items.length,0);
  assert.equal((await request(`/api/enterprises/${id}`,'PATCH',{contact:'更新联系人'},other)).status,403);
  const updated=await request(`/api/enterprises/${id}`,'PATCH',{contact:'更新联系人'},owner);
  assert.equal(updated.status,200);
  assert.equal(updated.body.enterprise.name,input.name);
  assert.equal(updated.body.enterprise.contact,'更新联系人');
  const caseInput={type:'penalty',event:'未按要求履行公示义务',authority:'测试市场监管局',doc_no:'测罚字〔2025〕1号',listed_date:'2025-01-10',level:'general'};
  assert.equal((await request(`/api/enterprises/${id}/cases`,'POST',caseInput,other)).status,403);
  assert.equal((await request(`/api/enterprises/${id}/cases`,'POST',{...caseInput,listed_date:'2025-02-30'},owner)).status,400);
  const built=await request(`/api/enterprises/${id}/cases`,'POST',caseInput,owner);
  assert.equal(built.status,200);
  const detail=await request(`/api/cases/${built.body.case.id}`,'GET',undefined,owner);
  assert.equal(detail.status,200);
  assert.equal(detail.body.case.stage,'draft');
  assert.equal(detail.body.case.rectified,null);
  assert.ok(detail.body.tasks.length>=3);
  assert.equal(detail.body.timeline[0].action,'建立修复事项');
  assert.equal(detail.body.channels.length,0,'new case must not inherit simulated observations');
  assert.equal((await request(`/api/cases/${built.body.case.id}`,'GET',undefined,other)).status,403);
  const relog=(await request('/api/auth/login','POST',{phone:'13900009002',password:'test-only-987'})).cookie;
  const overview=await request(`/api/enterprises/${id}/overview`,'GET',undefined,relog);
  assert.equal(overview.body.summary.total,1);
  assert.equal(overview.body.enterprise.contact,'更新联系人');
  assert.equal((await request('/api/enterprises','POST',{...input,credit_code:'bad'},owner)).status,400);
});

test('evidence bytes are private, reviewed official result is required for repaired, archive removes eligibility', async () => {
  const owner=await account('13900009004'), outsider=await account('13900009005');
  const e=await request('/api/enterprises','POST',{name:'证据测试企业',credit_code:'91430100MA4L000027'},owner);
  const built=await request(`/api/enterprises/${e.body.enterprise.id}/cases`,'POST',{type:'penalty',level:'general',event:'证据验证',authority:'测试机关',listed_date:'2025-01-01'},owner);
  const id=built.body.case.id;
  await isolated.db.run("UPDATE cases SET stage='reviewing' WHERE id=?",[id]);
  assert.equal((await request(`/api/cases/${id}/stage`,'POST',{to:'repaired'},owner)).status,400);
  const payload={filename:'修复决定.pdf',kind:'official_result',source:'测试机关决定原件',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')};
  assert.equal((await request(`/api/cases/${id}/evidence`,'POST',payload,outsider)).status,403);
  const uploaded=await request(`/api/cases/${id}/evidence`,'POST',payload,owner);
  assert.equal(uploaded.status,200);
  const evidence=uploaded.body.evidence;
  assert.equal(evidence.digest.length,64);
  assert.equal((await request(`/api/evidence/${evidence.id}`,'GET',undefined,outsider)).status,403);
  assert.equal((await request(`/api/cases/${id}/stage`,'POST',{to:'repaired'},owner)).status,400,'upload alone cannot mark repaired');
  assert.equal((await request(`/api/evidence/${evidence.id}/review`,'POST',{note:'已对照决定原件核录'},owner)).status,200);
  await request(`/api/cases/${id}/facts`,'PATCH',{removed_date:'2026-10-30'},owner);
  assert.equal((await request(`/api/cases/${id}/stage`,'POST',{to:'repaired'},owner)).status,200);
  const file=await fetch(base+`/api/evidence/${evidence.id}/download`,{headers:{cookie:owner}});
  assert.equal(file.status,200);assert.equal(await file.text(),'%PDF-1.4\nfixture');
  assert.equal((await request(`/api/evidence/${evidence.id}/archive`,'POST',{note:'由新版替换'},owner)).status,200);
  assert.equal((await request(`/api/cases/${id}/evidence`,'GET',undefined,owner)).body.items[0].archived,1);
  assert.equal((await request(`/api/cases/${id}/evidence`,'POST',{...payload,filename:'伪装.pdf',data:Buffer.from('<script>alert(1)</script>').toString('base64')},owner)).status,400);
});

test('documents preserve immutable fact fields, sanitize content, retain versions, and block invalid exports', async () => {
  const cookie=await account('13900009006');
  const e=(await request('/api/enterprises','POST',{name:'文书测试企业',credit_code:'91430100MA4L000035',legal:'张测试'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'测试文书',authority:'测试局',doc_no:'测试〔2025〕8号',listed_date:'2025-01-01'},cookie)).body.case;
  await isolated.db.run("INSERT INTO doc_templates (doc_key,title,body) VALUES ('apply','信用修复申请书',?)",['<h4>信用修复申请书</h4><p>申请人<span class="lock">{{name}}</span>，代码<span class="lock">{{code}}</span>，文号<span class="lock">{{docNo}}</span>。</p><p>{{measure}}</p>']);
  const docs=require('../src/services/docs');
  const original=(await docs.build(k.id)).docs.apply.html;
  assert.ok(!original.includes('罚款已足额缴纳'),'unknown obligations must not be invented');
  await docs.save(k.id,'apply',original.replace('文书测试企业','另一家公司'),{source:'manual',userId:1});
  const check=await docs.check(k.id);
  assert.equal(check.valid,false);
  assert.ok(check.issues.some(i=>i.field==='name'));
  const failed=await request(`/api/pdf/doc?case=${k.id}&key=apply`,'GET',undefined,cookie);
  assert.equal(failed.status,400);
  await docs.save(k.id,'apply',original.replace(/【待补充：[^】]*】/g,'企业将按实际情况补充证明。')+'<script>alert(1)</script><img src=x onerror="alert(1)">',{source:'manual',userId:1});
  const clean=(await docs.build(k.id)).docs.apply;
  assert.ok(!/<script|onerror|<img/i.test(clean.html));
  const versions=await request(`/api/cases/${k.id}/docs/apply/versions`,'GET',undefined,cookie);
  assert.equal(versions.status,200);assert.equal(versions.body.items.length,2);
  assert.equal((await docs.check(k.id)).valid,true);
  for(const [format,magic] of [['pdf','%PDF-'],['word','PK']]){
    const file=await fetch(base+`/api/${format}/doc?case=${k.id}&key=apply`,{headers:{cookie}});
    assert.equal(file.status,200,await (file.status===200?Promise.resolve(''):file.text()));
    const bytes=Buffer.from(await file.arrayBuffer());assert.ok(bytes.subarray(0,magic.length).equals(Buffer.from(magic)));
    require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),`xft-material.${format==='word'?'docx':'pdf'}`),bytes);
  }
  await docs.reset(k.id,'apply');
  assert.equal((await request(`/api/cases/${k.id}/docs/apply/versions`,'GET',undefined,cookie)).body.items.length,3);
  const restored=await request(`/api/cases/${k.id}/docs/apply/restore`,'POST',{version:2},cookie);
  assert.equal(restored.status,200);assert.equal(restored.body.docs[0].version,4);
  assert.equal((await docs.check(k.id)).valid,true);
});

test('case detail exposes material completeness separately from diagnostic score and stage progress', async () => {
  const cookie = await account('13900009032');
  const e = (await request('/api/enterprises', 'POST', {
    name: '材料进度口径企业', credit_code: '91430100MA4L000191'
  }, cookie)).body.enterprise;
  const k = (await request(`/api/enterprises/${e.id}/cases`, 'POST', {
    type: 'penalty', level: 'general', event: '材料进度口径测试',
    authority: '测试局', doc_no: '口径1号', listed_date: '2025-01-01'
  }, cookie)).body.case;
  const detail = await request(`/api/cases/${k.id}`, 'GET', undefined, cookie);
  assert.equal(detail.status, 200);
  assert.equal(typeof detail.body.rule.score, 'number');
  assert.equal(typeof detail.body.stage.progress, 'number');
  assert.equal(typeof detail.body.materialCheck.score, 'number');
  assert.equal(typeof detail.body.materialCheck.valid, 'boolean');
  assert.ok(Array.isArray(detail.body.materialCheck.missing));
  assert.ok(Array.isArray(detail.body.materialCheck.issues));
  assert.notEqual(detail.body.materialCheck.score, undefined);
});

test('manual monitoring matches enterprise and item, simulation cannot support objections, draft is never sent', async () => {
  const cookie=await account('13900009007');
  const e=(await request('/api/enterprises','POST',{name:'监测测试企业',credit_code:'91430100MA4L000043'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'监测验证',authority:'测试局',doc_no:'监测8号',listed_date:'2025-01-01'},cookie)).body.case;
  const id=k.id;
  const input={channel:'qcc',state:'bad',note:'仍在展示该条记录',source_url:'https://example.com/record/8',observed_at:'2026-10-31',credit_code:e.credit_code,doc_no:'另一事项',authority:k.authority};
  assert.equal((await request(`/api/cases/${id}/channels/record`,'POST',input,cookie)).status,400);
  input.doc_no=k.doc_no;
  const record=await request(`/api/cases/${id}/channels/record`,'POST',input,cookie);
  assert.equal(record.status,200);
  let latest=(await request(`/api/cases/${id}/channels`,'GET',undefined,cookie)).body;
  assert.equal(latest.channels[0].provider,'manual');
  assert.equal(latest.snapshots[0].source,'manual');
  assert.equal((await request(`/api/cases/${id}/objection`,'POST',{channel:'qcc'},cookie)).status,400,'no official proof');
  const payload={filename:'决定.pdf',kind:'official_result',source:'测试决定',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')};
  const proof=(await request(`/api/cases/${id}/evidence`,'POST',payload,cookie)).body.evidence;
  await request(`/api/evidence/${proof.id}/review`,'POST',{note:'核对原件'},cookie);
  const draft=await request(`/api/cases/${id}/objection`,'POST',{channel:'qcc'},cookie);
  assert.equal(draft.status,200);assert.equal(draft.body.status,'draft');
  const row=await isolated.db.one('SELECT * FROM objections WHERE id=?',[draft.body.id]);
  assert.equal(row.sent_at,null);assert.ok(!row.body_html.includes('3 个工作日'));
  const exported=await fetch(base+`/api/objections/${row.id}/pdf`,{headers:{cookie}});
  assert.equal(exported.status,200);assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const stranger=await account('13900009012');
  assert.equal((await request(`/api/objections/${row.id}/pdf`,'GET',undefined,stranger)).status,403);
  assert.equal((await request(`/api/objections/${row.id}/transition`,'POST',{to:'submitted'},cookie)).status,400);
  const receipt=(await request(`/api/cases/${id}/evidence`,'POST',{...payload,kind:'receipt',filename:'提交回执.pdf'},cookie)).body.evidence;
  assert.equal((await request(`/api/objections/${row.id}/transition`,'POST',{to:'submitted',note:'企业自行在纠错入口提交',evidence_id:receipt.id},cookie)).status,200);
  assert.equal((await request(`/api/objections/${row.id}/transition`,'POST',{to:'resolved',note:'尚未核验'},cookie)).status,400);
});

test('certificates require proof, bind immutable signed snapshot, deduplicate, protect PDFs and revoke', async () => {
  const owner=await account('13900009008'),other=await account('13900009009');
  const e=(await request('/api/enterprises','POST',{name:'凭证测试企业',credit_code:'91430100MA4L000051',legal:'不公开法人'},owner)).body.enterprise;
  const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'凭证验证',authority:'测试局',doc_no:'凭证8号',listed_date:'2025-01-01'},owner)).body.case;
  assert.equal((await request(`/api/cases/${k.id}/certificates`,'POST',{},owner)).status,400);
  const payload={filename:'决定.pdf',kind:'official_result',source:'测试决定',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')};
  const proof=(await request(`/api/cases/${k.id}/evidence`,'POST',payload,owner)).body.evidence;
  await request(`/api/evidence/${proof.id}/review`,'POST',{note:'核对原件'},owner);
  await isolated.db.run("UPDATE cases SET stage='repaired',removed_date='2026-10-30' WHERE id=?",[k.id]);
  const issued=await request(`/api/cases/${k.id}/certificates`,'POST',{},owner);
  assert.equal(issued.status,200);const c=issued.body.certificate;
  const again=await request(`/api/cases/${k.id}/certificates`,'POST',{},owner);
  assert.equal(again.body.certificate.code,c.code);
  let verified=(await request(`/api/verify/${c.code}`)).body.result;
  assert.equal(verified.state,'valid');assert.equal(verified.enterprise.legal,undefined);
  await request(`/api/enterprises/${e.id}`,'PATCH',{name:'变更后的企业名称'},owner);
  verified=(await request(`/api/verify/${c.code}`)).body.result;
  assert.equal(verified.enterprise.name,e.name);assert.equal(verified.state,'valid','current business edits must not corrupt historical snapshot');
  assert.equal((await request(`/api/pdf/cert?code=${c.code}`,'GET',undefined,other)).status,403);
  await isolated.db.run("UPDATE certificates SET valid_until='2099-12-31' WHERE code=?",[c.code]);
  assert.equal((await request(`/api/verify/${c.code}`)).body.result.state,'tampered');
  await isolated.db.run('UPDATE certificates SET valid_until=? WHERE code=?',[c.valid_until,c.code]);
  assert.equal((await request(`/api/certificates/${c.code}/revoke`,'POST',{reason:'企业申请撤销'},owner)).status,200);
  assert.equal((await request(`/api/verify/${c.code}`)).body.result.state,'revoked');
});

test('scheduled monitoring persists, leases prevent duplicate work, errors retry, pause survives in-flight completion', async () => {
  const cookie=await account('13900009010'),other=await account('13900009011');
  const e=(await request('/api/enterprises','POST',{name:'定时测试企业',credit_code:'91430100MA4L000060'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'调度验证',authority:'测试局',doc_no:'定时8号',listed_date:'2025-01-01'},cookie)).body.case;
  assert.equal((await request(`/api/cases/${k.id}/schedule`,'POST',{enabled:true,interval_hours:24},other)).status,403);
  assert.equal((await request(`/api/cases/${k.id}/schedule`,'POST',{enabled:true,interval_hours:0},cookie)).status,400);
  const saved=await request(`/api/cases/${k.id}/schedule`,'POST',{enabled:true,interval_hours:24},cookie);
  assert.equal(saved.status,200);assert.equal(saved.body.job.state,'queued');
  const jobs=require('../src/services/jobs');
  await isolated.db.run('UPDATE scheduled_jobs SET next_at=NOW() WHERE case_id=?',[k.id]);
  let calls=0;
  const scan=async()=>{calls++;await new Promise(r=>setTimeout(r,30));return {failed:false}};
  await Promise.all([jobs.tick(scan),jobs.tick(scan)]);
  assert.equal(calls,1,'only one worker may claim the due row');
  let job=await isolated.db.one('SELECT * FROM scheduled_jobs WHERE case_id=?',[k.id]);
  assert.equal(job.state,'queued');assert.equal(job.attempts,0);assert.ok(job.last_run_at);
  await isolated.db.run('UPDATE scheduled_jobs SET next_at=NOW() WHERE id=?',[job.id]);
  await jobs.tick(async()=>{throw new Error('授权接口暂不可用')});
  job=await isolated.db.one('SELECT * FROM scheduled_jobs WHERE id=?',[job.id]);
  assert.equal(job.attempts,1);assert.match(job.last_error,/授权接口/);assert.equal(job.state,'queued');
  await isolated.db.run('UPDATE scheduled_jobs SET next_at=NOW() WHERE id=?',[job.id]);
  await jobs.tick(async()=>{await request(`/api/cases/${k.id}/schedule`,'POST',{enabled:false},cookie);return {failed:false}});
  job=await isolated.db.one('SELECT * FROM scheduled_jobs WHERE id=?',[job.id]);assert.equal(job.state,'paused');
  assert.equal((await request(`/api/cases/${k.id}/schedule`,'GET',undefined,cookie)).body.job.state,'paused');
});

test('rules require reviewed applicable version, clamp calendar months, and retain diagnostic snapshots', async () => {
  const rules=require('../src/services/rules');
  assert.equal(rules.addMonths('2025-01-31',1),'2025-02-28');
  assert.equal(rules.addMonths('2024-01-31',1),'2024-02-29');
  const kase={id:'rule-fixture',type:'penalty',level:'general',authority:'测试市场监管局',listed_date:'2025-01-31',obligation_at:'2025-02-02',rectified:1,no_new_similar:1};
  let ev=await rules.evaluate(kase,'2026-10-31');assert.equal(ev.eligible,false);assert.equal(ev.status,'needs_review');
  await isolated.db.run("INSERT INTO rule_versions (rule_key,version,title,case_type,level,authority_match,source_url,effective_from,effective_until,review_status,review_note,definition) VALUES ('test',1,'隔离测试规则','penalty','general','市场监管','https://example.com/test-rule','2025-01-01','2026-12-31','reviewed','仅测试，不代表法规',?)",[JSON.stringify({months:6,reviewDays:15,materials:['apply','promise']})]);
  ev=await rules.evaluate(kase,'2026-10-31');assert.equal(ev.eligible,true);assert.equal(ev.applyFrom,'2025-07-31');assert.equal(ev.ruleVersion.version,1);
  assert.equal((await rules.evaluate({...kase,authority:'测试税务局'},'2026-10-31')).eligible,false);
  // L2 类型：提供参考材料清单，但不输出任何判定结论
  const l2=await rules.evaluate({...kase,type:'blacklist'},'2026-10-31');
  assert.ok(l2.materials.length>0);assert.equal(l2.status,'needs_review');assert.equal(l2.eligible,false);assert.equal(l2.applyFrom,null);
  // L3 类型（法院失信被执行人）不属于行政修复路径，不给材料也不给结论
  const l3=await rules.evaluate({...kase,type:'court'},'2026-10-31');
  assert.equal(l3.materials.length,0);assert.equal(l3.status,'needs_review');
  assert.equal((await rules.evaluate(kase,'2027-01-01')).eligible,false);
  const cookie=await account('13900009013');
  const ent=(await request('/api/enterprises','POST',{name:'规则快照企业',credit_code:'91430100MA4L000078'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${ent.id}/cases`,'POST',{type:'penalty',level:'general',authority:kase.authority,event:'诊断快照',listed_date:'2025-01-31'},cookie)).body.case;
  assert.equal((await request(`/api/cases/${k.id}/diagnose`,'POST',{},cookie)).status,200);
  const snap=await isolated.db.one('SELECT * FROM diagnosis_snapshots WHERE case_id=?',[k.id]);assert.ok(snap);
  const content=typeof snap.content==='string'?JSON.parse(snap.content):snap.content;
  assert.equal(content.rule.version,1);assert.equal(content.facts.rectified,null);
  await isolated.db.run("UPDATE rule_versions SET review_status='withdrawn' WHERE rule_key='test'");
  const after=await isolated.db.one('SELECT content FROM diagnosis_snapshots WHERE case_id=?',[k.id]);
  assert.deepEqual(typeof after.content==='string'?JSON.parse(after.content):after.content,content);
});

test('task assignment keeps dates, respects dependencies, and records evidence without cross-case receipts',async()=>{
  const cookie=await account('13900009014'),other=await account('13900009015');
  const ent=(await request('/api/enterprises','POST',{name:'任务协作企业',credit_code:'91430100MA4L000086'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${ent.id}/cases`,'POST',{type:'penalty',level:'general',authority:'测试局',event:'任务协作',listed_date:'2025-01-01'},cookie)).body.case;
  const tasks=(await request(`/api/cases/${k.id}`,'GET',undefined,cookie)).body.tasks;
  const id=tasks[0].id;
  assert.equal((await request(`/api/tasks/${id}`,'PATCH',{owner:'财务部',due_date:'2026-11-02',note:'补齐缴款材料'},other)).status,403);
  assert.equal((await request(`/api/tasks/${id}`,'PATCH',{owner:'财务部',due_date:'2026-02-30',note:'错误日期'},cookie)).status,400);
  let changed=await request(`/api/tasks/${id}`,'PATCH',{owner:'财务部',due_date:'2026-11-02',note:'补齐缴款材料'},cookie);
  assert.equal(changed.status,200);assert.equal(changed.body.task.owner,'财务部');
  assert.equal((await request(`/api/tasks/${id}/status`,'POST',{status:'bogus'},cookie)).status,400);
  await isolated.db.run('UPDATE tasks SET depends_on=? WHERE id=?',[id,tasks[1].id]);
  assert.equal((await request(`/api/tasks/${tasks[1].id}/status`,'POST',{status:'done'},cookie)).status,400);
  assert.equal((await request(`/api/tasks/${id}/status`,'POST',{status:'done'},cookie)).status,200);
  assert.equal((await request(`/api/tasks/${tasks[1].id}/status`,'POST',{status:'done'},cookie)).status,200);
  assert.equal((await request(`/api/tasks/${id}/status`,'POST',{status:'todo'},cookie)).status,400,'completed downstream task must be reopened first');
  const events=await isolated.db.all('SELECT * FROM task_events WHERE task_id=? ORDER BY id',[id]);
  assert.ok(events.length>=2);assert.match(events[0].note,/缴款/);
});

test('stage submission and acceptance need actual receipts and record them in the same transition',async()=>{
  const cookie=await account('13900009016');
  const ent=(await request('/api/enterprises','POST',{name:'流转回执企业',credit_code:'91430100MA4L000094'},cookie)).body.enterprise;
  const k=(await request(`/api/enterprises/${ent.id}/cases`,'POST',{type:'penalty',level:'general',authority:'流转专用机关',doc_no:'流程1号',event:'办理流程',listed_date:'2025-01-01'},cookie)).body.case;
  await isolated.db.run("INSERT INTO rule_versions (rule_key,version,title,case_type,level,authority_match,source_url,effective_from,review_status,review_note,definition) VALUES ('flow-test',1,'流转测试规则','penalty','general','流转专用机关','https://example.com/flow','2025-01-01','reviewed','测试',?)",[JSON.stringify({months:0,reviewDays:15,materials:['apply']})]);
  await request(`/api/cases/${k.id}/facts`,'PATCH',{obligation_at:'2025-02-01',rectified:1,no_new_similar:1},cookie);
  await isolated.db.run("UPDATE cases SET stage='materials_ready' WHERE id=?",[k.id]);
  assert.equal((await request(`/api/cases/${k.id}/stage`,'POST',{to:'submitted'},cookie)).status,400);
  const proof=(await request(`/api/cases/${k.id}/evidence`,'POST',{filename:'回执.pdf',kind:'receipt',source:'企业实际提交回执',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nreceipt').toString('base64')},cookie)).body.evidence;
  assert.equal((await request(`/api/cases/${k.id}/stage`,'POST',{to:'submitted',note:'已在官方入口提交',evidence_id:proof.id},cookie)).status,200);
  assert.equal((await request(`/api/cases/${k.id}/stage`,'POST',{to:'reviewing'},cookie)).status,400);
  assert.equal((await request(`/api/cases/${k.id}/stage`,'POST',{to:'reviewing',note:'机关已受理',evidence_id:proof.id},cookie)).status,200);
  const events=await isolated.db.all('SELECT * FROM stage_events WHERE case_id=? ORDER BY id',[k.id]);assert.equal(events.length,2);assert.equal(events[0].evidence_id,proof.id);
});


test('enterprise owners control membership and institutional grants; revocation is immediate and batch failures are isolated',async()=>{
 const owner=await account('13900009017'),staff=await account('13900009018'),agent=await account('13900009019'),admin=await account('13900009020');
 await isolated.db.run("UPDATE users SET role='admin' WHERE phone='13900009020'");
 const e=(await request('/api/enterprises','POST',{name:'机构协作企业',credit_code:'91430100MA4L000108'},owner)).body.enterprise;
 const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'机构协作',authority:'测试局',listed_date:'2025-01-01'},owner)).body.case;
 assert.equal((await request(`/api/enterprises/${e.id}/members`,'POST',{phone:'13900009018'},staff)).status,403);
 assert.equal((await request(`/api/enterprises/${e.id}/members`,'POST',{phone:'13900009018'},owner)).status,200);
 assert.equal((await request(`/api/cases/${k.id}`,'GET',undefined,staff)).status,200);
 assert.equal((await request(`/api/cases/${k.id}/rescan`,'POST',{},staff)).status,403);
 const org=(await request('/api/admin/orgs','POST',{name:'测试园区',type:'park',owner_phone:'13900009019'},admin)).body.org;
 assert.ok(org.id);
 assert.equal((await request(`/api/enterprises/${e.id}/grants`,'POST',{org_id:org.id,perm:'read',note:'园区只读查看'},owner)).status,200);
 assert.equal((await request(`/api/cases/${k.id}/rescan`,'POST',{},agent)).status,403);
 await request(`/api/enterprises/${e.id}/grants`,'POST',{org_id:org.id,perm:'write',note:'协作办理授权'},owner);
 const batch=await request('/api/org/batch-monitor','POST',{case_ids:[k.id,'not-owned']},agent);
 assert.equal(batch.status,200);assert.equal(batch.body.results[0].ok,true);assert.equal(batch.body.results[1].ok,false);
 assert.equal((await request(`/api/enterprises/${e.id}/grants`,'POST',{org_id:org.id,perm:'write',note:'不能自授权'},agent)).status,403);
 await request(`/api/enterprises/${e.id}/grants`,'POST',{org_id:org.id,perm:'read',revoked:true,note:'结束服务'},owner);
 assert.equal((await request(`/api/cases/${k.id}`,'GET',undefined,agent)).status,403);
 const uid=(await isolated.db.one("SELECT id FROM users WHERE phone='13900009018'")).id;
 await request(`/api/enterprises/${e.id}/members`,'POST',{phone:'13900009018',revoked:true},owner);
 assert.equal((await request(`/api/cases/${k.id}`,'GET',undefined,staff)).status,403);
 const membership=await isolated.db.one('SELECT * FROM enterprise_members WHERE enterprise_id=? AND user_id=?',[e.id,uid]);assert.ok(membership.revoked_at);
});

test('startup migration preserves revoked grants and never creates members or grants',async()=>{
 await isolated.db.run("INSERT INTO orgs (name,type) VALUES ('迁移无授权机构','park')");
 await isolated.db.run("INSERT INTO enterprises (name,credit_code) VALUES ('迁移无授权企业','91430100MA4L000124')");
 const before=await isolated.db.all('SELECT * FROM enterprise_members ORDER BY enterprise_id,user_id');
 const grants=await isolated.db.all('SELECT * FROM org_enterprises ORDER BY org_id,enterprise_id');
 await require('../db/migrate')({all:isolated.db.all,one:isolated.db.one,run:isolated.db.run});
 assert.deepEqual(await isolated.db.all('SELECT * FROM enterprise_members ORDER BY enterprise_id,user_id'),before);
 assert.deepEqual(await isolated.db.all('SELECT * FROM org_enterprises ORDER BY org_id,enterprise_id'),grants);
});

test('knowledge publishes only reviewed sourced entries; reminders deduplicate and read state is personal',async()=>{
 const owner=await account('13900009021'),other=await account('13900009022'),admin=await account('13900009023');
 await isolated.db.run("UPDATE users SET role='admin' WHERE phone='13900009023'");
 const e=(await request('/api/enterprises','POST',{name:'合规提醒企业',credit_code:'91430100MA4L000116'},owner)).body.enterprise;
 const draft={title:'待复核政策测试',category:'policy',body:'这是一条测试知识，不是真实法规',source_url:'https://example.com/policy',issuer:'测试机关',effective_at:'2026-01-01',review_status:'draft',review_note:''};
 const created=await request('/api/admin/knowledge','POST',draft,admin);assert.equal(created.status,200);
 assert.equal((await request('/api/kb?q=待复核','GET',undefined,owner)).body.items.length,0);
 assert.equal((await request('/api/admin/knowledge','POST',{...draft,review_status:'reviewed'},admin)).status,400);
 const published=await request('/api/admin/knowledge','POST',{...draft,title:'已复核政策测试',review_status:'reviewed',review_note:'仅用于自动化测试'},admin);assert.equal(published.status,200);
 const found=(await request('/api/kb?q=已复核','GET',undefined,owner)).body.items;assert.equal(found.length,1);assert.equal(found[0].source_url,draft.source_url);
 assert.equal((await request('/api/admin/knowledge','POST',draft,owner)).status,403);
 assert.equal((await request(`/api/enterprises/${e.id}/reminders`,'POST',{enabled:true,policy_updates:true,repeat_days:7},owner)).status,200);
 await require('../src/services/compliance').refresh();await require('../src/services/compliance').refresh();
 const notices=(await request(`/api/enterprises/${e.id}/notices`,'GET',undefined,owner)).body.items;
 assert.ok(notices.some(n=>n.kind==='policy'));assert.equal(new Set(notices.map(n=>n.dedup_key)).size,notices.length);
 assert.equal((await request(`/api/enterprises/${e.id}/notices`,'GET',undefined,other)).status,403);
 const n=notices[0];assert.equal((await request(`/api/notices/${n.id}/read`,'POST',{},other)).status,403);
 assert.equal((await request(`/api/notices/${n.id}/read`,'POST',{},owner)).status,200);
 assert.ok((await request(`/api/enterprises/${e.id}/notices`,'GET',undefined,owner)).body.items.find(x=>x.id===n.id).read_at);
});

test('purpose shares require valid proof-backed certificate; expiry, revocation and source withdrawal hide content',async()=>{
 const owner=await account('13900009024'),other=await account('13900009025');
 const e=(await request('/api/enterprises','POST',{name:'分享包测试企业',credit_code:'91430100MA4L000132',contact:'不能公开联系人'},owner)).body.enterprise;
 const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'分享包验证',authority:'测试局',doc_no:'分享1号',listed_date:'2025-01-01'},owner)).body.case;
 const proof=(await request(`/api/cases/${k.id}/evidence`,'POST',{filename:'结果.pdf',kind:'official_result',source:'测试决定',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')},owner)).body.evidence;
 await request(`/api/evidence/${proof.id}/review`,'POST',{note:'测试核录'},owner);
 await isolated.db.run("UPDATE cases SET stage='repaired',removed_date='2026-10-30' WHERE id=?",[k.id]);
 const c=(await request(`/api/cases/${k.id}/certificates`,'POST',{},owner)).body.certificate;
 const input={code:c.code,purpose:'financing',recipient:'测试接收单位',days:7};
 assert.equal((await request(`/api/cases/${k.id}/shares`,'POST',input,other)).status,403);
 const created=await request(`/api/cases/${k.id}/shares`,'POST',input,owner);assert.equal(created.status,200);const s=created.body.share;assert.ok(s.token.length>=40);
 let publicResult=(await request(`/api/share/${s.token}`)).body.result;assert.equal(publicResult.state,'valid');assert.equal(publicResult.purpose,'financing');assert.equal(publicResult.verification.enterprise.contact,undefined);assert.equal(publicResult.verification.officialProof.source,undefined);
 const pdf=await fetch(base+`/api/shares/${s.id}/pdf`,{headers:{cookie:owner}});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 assert.equal((await request(`/api/shares/${s.id}/revoke`,'POST',{},other)).status,403);
 await isolated.db.run('UPDATE purpose_shares SET expires_ts=? WHERE id=?',[Date.now()-1000,s.id]);
 assert.equal((await request(`/api/share/${s.token}`)).body.result.state,'expired');
 const next=(await request(`/api/cases/${k.id}/shares`,'POST',input,owner)).body.share;
 await request(`/api/shares/${next.id}/revoke`,'POST',{},owner);
 publicResult=(await request(`/api/share/${next.token}`)).body.result;assert.equal(publicResult.state,'revoked');assert.equal(publicResult.verification,undefined);
 assert.equal((await request(`/api/share-file/${next.id}`)).body.result.state,'revoked');
 const last=(await request(`/api/cases/${k.id}/shares`,'POST',{...input,purpose:'tender'},owner)).body.share;
 await request(`/api/evidence/${proof.id}/archive`,'POST',{note:'材料更新'},owner);
 publicResult=(await request(`/api/share/${last.token}`)).body.result;assert.equal(publicResult.state,'stale');assert.equal(publicResult.verification,undefined);
});

test('objection supplemental edits preserve evidence facts and history; submitted followups create notices once',async()=>{
 const cookie=await account('13900009026');
 const e=(await request('/api/enterprises','POST',{name:'异议编辑企业',credit_code:'91430100MA4L000140'},cookie)).body.enterprise;
 const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'general',event:'异议编辑',authority:'测试局',doc_no:'异议2号',listed_date:'2025-01-01'},cookie)).body.case;
 const input={channel:'qcc',state:'bad',note:'仍在展示记录',source_url:'https://example.com/objection',observed_at:'2026-10-31',credit_code:e.credit_code,doc_no:k.doc_no,authority:k.authority};
 await request(`/api/cases/${k.id}/channels/record`,'POST',input,cookie);
 const proof=(await request(`/api/cases/${k.id}/evidence`,'POST',{filename:'结果.pdf',kind:'official_result',source:'官方结果测试',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')},cookie)).body.evidence;
 await request(`/api/evidence/${proof.id}/review`,'POST',{note:'测试核录'},cookie);
 const o=(await request(`/api/cases/${k.id}/objection`,'POST',{channel:'qcc'},cookie)).body;
 const updated=await request(`/api/objections/${o.id}/supplement`,'POST',{note:'请联系企业核对 <script>alert(1)</script>'},cookie);assert.equal(updated.status,200);assert.ok(updated.body.objection.body_html.includes('异议2号'));assert.ok(!updated.body.objection.body_html.includes('<script>'));
 const receipt=(await request(`/api/cases/${k.id}/evidence`,'POST',{filename:'回执.pdf',kind:'receipt',source:'提交回执',observed_at:'2026-10-30',data:Buffer.from('%PDF-1.4\nreceipt').toString('base64')},cookie)).body.evidence;
 await request(`/api/objections/${o.id}/transition`,'POST',{to:'submitted',note:'自行提交',evidence_id:receipt.id},cookie);
 assert.equal((await request(`/api/objections/${o.id}/supplement`,'POST',{note:'提交后不得改函件'},cookie)).status,400);
 assert.equal((await request(`/api/objections/${o.id}/followup`,'POST',{date:'2026-10-30'},cookie)).status,200);
 await require('../src/services/compliance').refresh();await require('../src/services/compliance').refresh();
 assert.equal(Number((await isolated.db.one("SELECT COUNT(*) AS n FROM compliance_notices WHERE enterprise_id=? AND kind='objection'",[e.id])).n),1);
 const detail=(await request(`/api/cases/${k.id}/objections`,'GET',undefined,cookie)).body.items[0];assert.equal(detail.revisions.length,2);
});

test('unsupported types have no generic documents and catalog templates never assert unknown facts',async()=>{
 const cookie=await account('13900009027');const e=(await request('/api/enterprises','POST',{name:'模板边界企业',credit_code:'91430100MA4L000159'},cookie)).body.enterprise;
 const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'blacklist',level:'severe',event:'未支持事项',authority:'测试局',listed_date:'2025-01-01'},cookie)).body.case;
 const docs=require('../src/services/docs');assert.deepEqual((await docs.build(k.id)).docs,{});assert.equal((await docs.check(k.id)).valid,false);
 await require('../db/catalog')(isolated.db);
 const p=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'serious',event:'未知事实事项',authority:'测试局',doc_no:'边界1号',listed_date:'2025-01-01'},cookie)).body.case;
 const built=await docs.build(p.id);assert.ok(built.docs.plan);assert.ok(!built.docs.promise.html.includes('已如实履行'));assert.ok(built.docs.apply.html.includes('【待补充'));
});

// 107 号令第七条：「较低数额罚款」是两个条件同时成立（从轻/减轻阶次 + 5 万元以下）。
// 只按金额判等级会把「3 万元、一般阶次」误判成轻微，可申请日随之算错，所以要在接口层挡住。
test('minor level requires lenient discretion stage and 50k cap together, otherwise verdict is withheld',async()=>{
 const cookie=await account('13900009031');
 const e=(await request('/api/enterprises','POST',{name:'等级核实企业',credit_code:'91430100MA4L000183'},cookie)).body.enterprise;
 await isolated.db.run(`INSERT INTO rule_versions (rule_key,version,title,case_type,level,authority_match,source_url,effective_from,review_status,review_note,definition,created_by)
   VALUES ('t-minor-107',1,'测试轻微规则','penalty','minor','市场监督管理局','https://example.invalid','2020-01-01','reviewed','测试用规则',?,1)`,
   [JSON.stringify({months:3,reviewDays:7,autoStopOnly:true,materials:['apply'],basis:[]})]);
 const k=(await request(`/api/enterprises/${e.id}/cases`,'POST',{type:'penalty',level:'minor',event:'测试轻微事项',authority:'湘潭市市场监督管理局',listed_date:'2026-01-01',fine_amount:30000,discretion:'normal'},cookie)).body.case;
 assert.equal(Number(k.fine_amount),30000);
 assert.equal(k.discretion,'normal');
 const r=(await request(`/api/cases/${k.id}`,'GET',undefined,cookie)).body.rule;
 assert.equal(r.levelCheck.state,'conflict');
 assert.equal(r.eligible,false);
 assert.equal(r.status,'needs_review');
 assert.ok(r.blockers.some(b=>b.kind==='level_conflict'));
 // 补登履行、整改事实后，冲突仍然优先于日期与条件，不给可申请日
 await request(`/api/cases/${k.id}/facts`,'PATCH',{obligation_at:'2026-01-10',rectified:1,rectify_at:'2026-01-12',no_new_similar:1},cookie);
 assert.equal((await request(`/api/cases/${k.id}`,'GET',undefined,cookie)).body.rule.status,'needs_review');
 // 改成从轻阶次，两个要件同时成立，结论恢复
 const ok=(await request(`/api/cases/${k.id}/facts`,'PATCH',{discretion:'lighter'},cookie)).body.rule;
 assert.equal(ok.levelCheck.state,'ok');
 assert.ok(!ok.blockers.some(b=>b.kind==='level_conflict'));
 assert.equal(ok.autoStopOnly,true);
 // 超过 5 万元上限同样不成立
 const over=(await request(`/api/cases/${k.id}/facts`,'PATCH',{fine_amount:60000},cookie)).body.rule;
 assert.equal(over.levelCheck.state,'conflict');
 assert.equal(over.status,'needs_review');
 // 非法阶次不得写入
 assert.equal((await request(`/api/cases/${k.id}/facts`,'PATCH',{discretion:'whatever'},cookie)).status,400);
 const fresh=await isolated.db.one('SELECT fine_amount,discretion FROM cases WHERE id=?',[k.id]);
 assert.equal(Number(fresh.fine_amount),60000);
 assert.equal(fresh.discretion,'lighter');
});
