'use strict';
/*
 * 同步监测、异议、办理进度记录、核对、PDF、AI 润色。
 */
const db = require('../db.js');
const auth = require('../services/auth.js');
const checks = require('../services/checks.js');
const cert = require('../services/cert.js');
const docs = require('../services/docs.js');
const ai = require('../ai.js');
const { sendBuffer } = require('../http.js');

async function guard(user, caseId) {
  const k = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!k) { const e = new Error('案件不存在'); e.code = 'NOT_FOUND'; throw e; }
  if (!(await auth.canAccess(user, k.enterprise_id))) { const e = new Error('无权访问该案件'); e.code = 'FORBIDDEN'; throw e; }
  return k;
}


async function guardWrite(user, caseId) {
  const k = await guard(user, caseId);
  if (!(await auth.canWrite(user, k.enterprise_id))) {
    const e = new Error('当前账号对该企业只有查看权限'); e.code = 'FORBIDDEN'; throw e;
  }
  return k;
}

const genPdf=require('../services/pdf');

module.exports = function register(r) {
  r.get('/api/cases/:id/schedule', async ({user,params}) => {
    await guard(user,params.id);return {job:await require('../services/jobs').get(params.id)};
  },{auth:true});
  r.post('/api/cases/:id/schedule', async ({user,params,body}) => {
    await guardWrite(user,params.id);return {job:await require('../services/jobs').configure(params.id,body,user)};
  },{auth:true});
  // 巡检
  r.post('/api/cases/:id/rescan', async ({ user, params }) => {
    await guardWrite(user, params.id);
    const run = await checks.rescan(params.id, 'manual');
    return { run, latest: await checks.latest(params.id) };
  }, { auth: true });

  r.get('/api/cases/:id/channels', async ({ user, params }) => {
    await guard(user, params.id);
    return await checks.latest(params.id);
  }, { auth: true });

  r.post('/api/cases/:id/channels/record', async ({user,params,body}) => {
    await guardWrite(user,params.id);return checks.record(params.id,body,user);
  }, {auth:true});
  r.get('/api/cases/:id/objections', async ({user,params}) => {
    await guard(user,params.id);
    const items=await db.all('SELECT * FROM objections WHERE case_id=? ORDER BY id DESC',[params.id]);
    for(const item of items){
      item.events=await db.all('SELECT * FROM objection_events WHERE objection_id=? ORDER BY id',[item.id]);
      item.revisions=await db.all('SELECT * FROM objection_revisions WHERE objection_id=? ORDER BY version DESC',[item.id]);
      item.followup=await db.one('SELECT remind_date FROM objection_followups WHERE objection_id=?',[item.id]);
    }
    return {items};
  }, {auth:true});
  r.post('/api/objections/:id/transition', async ({user,params,body}) => ({objection:await checks.transition(Number(params.id),body,user)}),{auth:true});

  r.post('/api/objections/:id/supplement', async ({user,params,body})=>({objection:await checks.supplement(Number(params.id),body,user)}),{auth:true});
  r.post('/api/objections/:id/followup', async ({user,params,body})=>({followup:await checks.followup(Number(params.id),body,user)}),{auth:true});
  // 异议函
  r.get('/api/objections/:id/pdf', async ({user,params,res}) => {
    const row=await db.one('SELECT * FROM objections WHERE id=?',[params.id]);
    if(!row)throw Object.assign(new Error('异议不存在'),{code:'NOT_FOUND'});
    const kase=await guard(user,row.case_id);
    const html=docs.clean(row.body_html).replace(/^\s*<h4>[\s\S]*?<\/h4>/,'');
    const buf=await genPdf({title:'数据异议与更正函',subtitle:'请企业核对后自行提交，平台不会自动发送',html,docNo:kase.id,footer:'信复通 · 企业异议材料草稿',seal:false});
    sendBuffer(res,buf,'application/pdf','数据异议与更正函.pdf');return {__raw:true};
  },{auth:true});
  r.get('/api/cases/:id/objection/preview', async ({ user, params, url }) => {
    await guard(user, params.id);
    const channel = url.searchParams.get('channel') || 'qcc';
    return { channel, html: await checks.objectionHtml(params.id, channel) };
  }, { auth: true });

  r.post('/api/cases/:id/objection', async ({ user, params, body, ip }) => {
    await guardWrite(user, params.id);
    const channel = body.channel || 'qcc';
    const out = await checks.createObjection(params.id, channel, body.html, user);
    await auth.audit(user.id, 'objection_draft', `${params.id}/${channel}`, '生成异议函草稿', ip);
    return out;
  }, { auth: true });

  // 办理进度记录
  r.post('/api/cases/:id/certificates', async ({ user, params }) => {
    await guardWrite(user, params.id);
    return { certificate: await cert.issue(params.id) };
  }, { auth: true });

  r.get('/api/cases/:id/certificates', async ({ user, params }) => {
    await guard(user, params.id);
    return { items: await cert.listOf(params.id) };
  }, { auth: true });

  r.post('/api/certificates/:code/revoke', async ({ user, params, body, ip }) => {
    const existing=await cert.get(params.code);
    if(!existing)throw new Error('记录不存在');
    await guardWrite(user,existing.case_id);
    const c = await cert.revoke(params.code, body.reason);
    await auth.audit(user.id, 'cert_revoke', params.code, body.reason, ip);
    return { certificate: c };
  }, { auth: true });

  // 验真（公开）
  r.get('/api/verify/:code', async ({ params }) => ({ result: await cert.verify(decodeURIComponent(params.code)) }), { auth: false });

  // AI 润色
  r.post('/api/cases/:id/docs/:key/polish', async ({ user, params, ip }) => {
    await guardWrite(user, params.id);
    const built = await docs.build(params.id);
    const doc = built.docs[params.key];
    if (!doc) throw new Error('文书不存在');
    const e = built.enterprise;
    const k = built.case;
    const res = await ai.polishDoc({
      docName: doc.title,
      html: doc.html,
      facts: {
        企业: e.name, 统一社会信用代码: e.credit_code, 法定代表人: e.legal,
        失信行为: k.event, 决定机关: k.authority, 决定文号: k.doc_no,
        列入日期: k.listed_date, 移出日期: k.removed_date
      }
    });
    if (res.ok) {
      const after = await docs.save(params.id, params.key, res.html, { source: 'ai', userId: user.id });
      const ti = res.usage?.prompt_tokens || 0, to = res.usage?.completion_tokens || 0;
      await db.run('INSERT INTO usage_logs (subject_type, subject_id, kind, tokens_in, tokens_out, cost) VALUES (?,?,?,?,?,?)',
        ['user', user.id, 'ai_doc', ti, to, Math.round(((ti * 2 + to * 8) / 1e6) * 10000) / 10000]);
      await auth.audit(user.id, 'ai_polish', `${params.id}/${params.key}`, 'AI 润色', ip);
      return { ok: true, degraded: false, docs: Object.entries(after.docs).map(([key, d]) => ({ key, ...d })) };
    }
    return { degraded: true, reason: res.reason || 'AI 暂不可用，已保留当前材料' };
  }, { auth: true });

  r.get('/api/ai/status', async () => ({ available: ai.available(), model: require('../config.js').ai.model }), { auth: true });

  // PDF：单份文书
  r.get('/api/pdf/doc', async ({ user, res, url }) => {
    const caseId = url.searchParams.get('case');
    const key = url.searchParams.get('key');
    await guard(user, caseId);
    const built = await docs.build(caseId);
    const d = built.docs[key];
    if (!d) throw new Error('文书不存在');
    const validation = await docs.check(caseId, key);
    if (!validation.valid) throw new Error('材料未通过校验，请补齐待填写内容并纠正锁定事实后再导出');
    const html = String(d.html).replace(/^\s*<h4>[\s\S]*?<\/h4>/, '');
    const buf = await genPdf({
      title: d.title, subtitle: `${built.enterprise.name} · 统一社会信用代码 ${built.enterprise.credit_code}`,
      html, docNo: built.case.id, footer: '信复通 · 民营企业信用修复材料', seal: false
    });
    sendBuffer(res, buf, 'application/pdf', `${d.title}.pdf`);
    return { __raw: true };
  }, { auth: true });

  r.get('/api/word/doc', async ({ user, res, url }) => {
    const caseId=url.searchParams.get('case'), key=url.searchParams.get('key');
    await guard(user,caseId);
    const built=await docs.build(caseId), d=built.docs[key];
    if(!d) throw new Error('文书不存在');
    if(!(await docs.check(caseId,key)).valid) throw new Error('材料未通过校验，请补齐待填写内容并纠正锁定事实后再导出');
    const buf=await require('../services/word').generate({title:d.title,subtitle:built.enterprise.name,html:d.html.replace(/^\s*<h4>[\s\S]*?<\/h4>/,''),docNo:caseId});
    sendBuffer(res,buf,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',d.title+'.docx');
    return {__raw:true};
  }, {auth:true});

  // PDF：办理进度记录（原「信用修复状态凭证」，不具行政效力，不作修复证明）
  r.get('/api/pdf/cert', async ({ user, res, url }) => {
    const code = url.searchParams.get('code');
    const original=await cert.get(code);
    if(!original)throw new Error('记录不存在');
    await guard(user,original.case_id);
    const v = await cert.verify(code);
    if(v.state!=='valid')throw new Error('该记录当前不可导出：'+v.message);
    const esc=docs.esc;
    const html=`<p>企业：${esc(v.enterprise.name)}；统一社会信用代码：${esc(v.enterprise.creditCode)}。</p>
<p>事项：${esc(v.case.event)}；决定文号：${esc(v.case.docNo)}；决定机关：${esc(v.case.authority)}；企业登记移出日期：${esc(v.case.removedDate)}。</p>
<p>本记录仅说明企业在上述事项上的办理进度，记录生成时由企业提供并人工核录的官方材料摘要为：${v.officialProof.digest}。未向行政机关联网验证，不证明失信信息已完成修复，不替代官方决定、银行授信或招标方审核。</p>
<p>渠道快照：${v.channels.map(c=>esc(c.name)+'（'+esc(c.provider)+'）：'+esc(c.state)).join('；')||'尚无核验记录'}。模拟、待核验或失败记录不能证明真实同步。</p>
<p>记录编号：${esc(code)}；生成日期：${esc(v.certificate.issuedAt)}；核对有效期至：${esc(v.certificate.validUntil)}；版本：${v.certificate.version}。</p>
<p>内容摘要：${v.certificate.digest}</p>`;
    const buf = await genPdf({
      title: '信用修复办理进度记录', html, docNo: code, qrUrl:require('../config').publicBaseUrl+'/verify?code='+encodeURIComponent(code), footer: '信复通 · 办理进度记录（非修复证明）', seal: false
    });
    sendBuffer(res, buf, 'application/pdf', '信用修复办理进度记录.pdf');
    return { __raw: true };
  }, { auth: true });
};
