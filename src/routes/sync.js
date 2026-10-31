'use strict';
/*
 * 同步监测、异议、凭证、验真、PDF、AI 润色。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
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

function genPdf(payload) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [path.join(__dirname, '..', '..', 'tools', 'gen_pdf.py')]);
    const out = [];
    const err = [];
    py.stdout.on('data', c => out.push(c));
    py.stderr.on('data', c => err.push(c));
    py.on('close', code => {
      if (code !== 0) return reject(new Error('PDF 生成失败：' + Buffer.concat(err).toString().slice(0, 300)));
      resolve(Buffer.concat(out));
    });
    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

module.exports = function register(r) {
  // 巡检
  r.post('/api/cases/:id/rescan', async ({ user, params }) => {
    await guard(user, params.id);
    const run = await checks.rescan(params.id, 'manual');
    return { run, latest: await checks.latest(params.id) };
  }, { auth: true });

  r.get('/api/cases/:id/channels', async ({ user, params }) => {
    await guard(user, params.id);
    return await checks.latest(params.id);
  }, { auth: true });

  // 异议函
  r.get('/api/cases/:id/objection/preview', async ({ user, params, url }) => {
    await guard(user, params.id);
    const channel = url.searchParams.get('channel') || 'qcc';
    return { channel, html: await checks.objectionHtml(params.id, channel) };
  }, { auth: true });

  r.post('/api/cases/:id/objection', async ({ user, params, body, ip }) => {
    await guard(user, params.id);
    const channel = body.channel || 'qcc';
    const out = await checks.createObjection(params.id, channel, body.html);
    await auth.audit(user.id, 'objection_send', `${params.id}/${channel}`, '发送异议函', ip);
    return out;
  }, { auth: true });

  // 凭证
  r.post('/api/cases/:id/certificates', async ({ user, params }) => {
    await guard(user, params.id);
    return { certificate: await cert.issue(params.id) };
  }, { auth: true });

  r.get('/api/cases/:id/certificates', async ({ user, params }) => {
    await guard(user, params.id);
    return { items: await cert.listOf(params.id) };
  }, { auth: true });

  r.post('/api/certificates/:code/revoke', async ({ user, params, body, ip }) => {
    if (user.role !== 'admin') { const e = new Error('仅平台运营可撤销'); e.code = 'FORBIDDEN'; throw e; }
    const c = await cert.revoke(params.code, body.reason);
    await auth.audit(user.id, 'cert_revoke', params.code, body.reason, ip);
    return { certificate: c };
  }, { auth: true });

  // 验真（公开）
  r.get('/api/verify/:code', async ({ params }) => ({ result: await cert.verify(decodeURIComponent(params.code)) }), { auth: false });

  // AI 润色
  r.post('/api/cases/:id/docs/:key/polish', async ({ user, params, ip }) => {
    await guard(user, params.id);
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
      await db.run('INSERT INTO usage_logs (subject_type, subject_id, kind, tokens_in, tokens_out, cost) VALUES (?,?,?,?,?,?)',
        ['user', user.id, 'ai_doc', res.usage?.prompt_tokens || 0, res.usage?.completion_tokens || 0, 0.02]);
      await auth.audit(user.id, 'ai_polish', `${params.id}/${params.key}`, 'AI 润色', ip);
      return { ok: true, degraded: false, docs: Object.entries(after.docs).map(([key, d]) => ({ key, ...d })) };
    }
    return { ok: false, degraded: Boolean(res.degraded), reason: res.reason };
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
    const html = String(d.html).replace(/^\s*<h4>[\s\S]*?<\/h4>/, '');
    const buf = await genPdf({
      title: d.title, subtitle: `${built.enterprise.name} · 统一社会信用代码 ${built.enterprise.credit_code}`,
      html, docNo: built.case.id, footer: '信复通 · 民营企业信用修复材料', seal: false
    });
    sendBuffer(res, buf, 'application/pdf', `${d.title}.pdf`);
    return { __raw: true };
  }, { auth: true });

  // PDF：凭证
  r.get('/api/pdf/cert', async ({ user, res, url }) => {
    const code = url.searchParams.get('code');
    const v = await cert.verify(code);
    if (v.state === 'notfound') throw new Error('凭证不存在');
    const html = `<p>兹证明：<span class="lock">${v.enterprise.name}</span>（统一社会信用代码：<span class="lock">${v.enterprise.credit_code}</span>），就「${v.case.event}」（决定文号：${v.case.docNo}，决定机关：${v.case.authority}），已依法完成信用修复。</p>
<p>截至本凭证签发之日，平台对多源渠道进行核验，各渠道同步状态见核验报告。扫描凭证二维码或访问验真页可核验真实性。</p>
<div class="meta">凭证编号 ${code}　签发日期 ${v.certificate.issuedAt.slice(0, 10)}　有效期至 ${v.certificate.validUntil}</div>
<p class="no-indent">内容摘要（SHA-256）：${v.certificate.digest}</p>
<p class="no-indent">前序摘要：${v.certificate.prevHash}</p>`;
    const buf = await genPdf({
      title: '信用修复状态凭证', html, docNo: code, footer: '信复通 · 信用修复凭证', seal: true
    });
    sendBuffer(res, buf, 'application/pdf', '信用修复状态凭证.pdf');
    return { __raw: true };
  }, { auth: true });
};
