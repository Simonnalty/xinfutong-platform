'use strict';
/*
 * 巡检服务：多源状态核验。
 * 每个渠道取一次「快照」，算摘要入 channel_snapshots；摘要变化即为差异。
 * 数据来源目前是内置模拟源（provider=mock），接口形状与真实采集一致。
 */
const db = require('../db.js');
const { sha256 } = require('../crypto.js');

const CHANNEL_STATE = {
  ok: { label: '已同步', tone: 'ok' },
  warn: { label: '部分同步', tone: 'warn' },
  bad: { label: '未同步', tone: 'bad' },
  idle: { label: '待核验', tone: 'idle' }
};

/** 模拟采集：按案件状态推演各渠道表现，保证可复现 */
function observe(kase, channelCode) {
  const repaired = kase.stage === 'repaired' || kase.removed_date;
  switch (channelCode) {
    case 'credit_china':
      return { state: repaired ? 'ok' : 'warn', note: repaired ? '已停止公示' : '公示中' };
    case 'gsxt':
      return { state: repaired ? 'ok' : 'ok', note: repaired ? '已移出经营异常名录' : '已移出，行政处罚仍在公示' };
    case 'qcc':
      return { state: 'bad', note: '仍显示「经营异常」' };
    case 'tianyancha':
      return { state: repaired ? 'warn' : 'warn', note: '处罚已撤销，名录未更新' };
    case 'bank':
      return { state: 'idle', note: '需企业授权后核验' };
    default:
      return { state: 'warn', note: '状态未知' };
  }
}

async function rescan(caseId, trigger = 'manual') {
  const kase = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!kase) throw new Error('案件不存在');
  const channels = await db.all('SELECT * FROM case_channels WHERE case_id = ? ORDER BY sort', [caseId]);
  const startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const runRes = await db.run('INSERT INTO checks_runs (case_id, started_at, trigger_by) VALUES (?,?,?)',
    [caseId, startedAt, trigger]);
  let diffs = 0;
  const detail = [];
  for (const ch of channels) {
    const obs = observe(kase, ch.channel_code);
    const payload = { channel: ch.channel_code, state: obs.state, note: obs.note, fetchedAt: startedAt };
    const digest = sha256(caseId + '|' + ch.channel_code + '|' + obs.state + '|' + obs.note);
    await db.run(`INSERT INTO channel_snapshots (case_id, channel_code, fetched_at, payload, digest, source, run_id)
                  VALUES (?,?,?,?,?,?,?)`,
      [caseId, ch.channel_code, startedAt, JSON.stringify(payload), digest, 'mock', runRes.insertId]);
    const changed = ch.state !== obs.state;
    if (changed && ch.state !== 'idle') diffs += 1;
    await db.run('UPDATE case_channels SET state = ?, note = ?, last_checked_at = ?, first_seen_at = COALESCE(first_seen_at, ?) WHERE id = ?',
      [obs.state, obs.note, startedAt, startedAt, ch.id]);
    detail.push({ code: ch.channel_code, name: ch.channel_name, from: ch.state, to: obs.state, changed });
  }
  const runDigest = sha256(caseId + '|' + startedAt + '|' + detail.map(d => d.to).join(','));
  await db.run('UPDATE checks_runs SET finished_at = ?, diffs = ?, digest = ? WHERE id = ?',
    [new Date().toISOString().slice(0, 19).replace('T', ' '), diffs, runDigest, runRes.insertId]);
  return { runId: runRes.insertId, diffs, channels: detail, at: startedAt };
}

async function latest(caseId) {
  const channels = await db.all('SELECT * FROM case_channels WHERE case_id = ? ORDER BY sort', [caseId]);
  const run = await db.one('SELECT * FROM checks_runs WHERE case_id = ? ORDER BY id DESC LIMIT 1', [caseId]);
  const snaps = await db.all('SELECT * FROM channel_snapshots WHERE case_id = ? ORDER BY id DESC LIMIT 20', [caseId]);
  return { channels, run, snapshots: snaps };
}

async function objectionHtml(caseId, channelCode) {
  const kase = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  const ent = await db.one('SELECT * FROM enterprises WHERE id = ?', [kase.enterprise_id]);
  const ch = await db.one('SELECT * FROM case_channels WHERE case_id = ? AND channel_code = ?', [caseId, channelCode]);
  if (!ch) throw new Error('渠道不存在');
  const today = new Date().toISOString().slice(0, 10);
  const { cn } = require('./docs.js');
  return `<h4>数据异议与更正函</h4>
<div class="meta">致：${ch.channel_name}　　${cn(today)}</div>
<p class="no-indent">${ch.channel_name}：</p>
<p>我方系<span class="lock">${ent.name}</span>（统一社会信用代码：<span class="lock">${ent.credit_code}</span>）。经查询，贵平台展示的关于我方的失信信息（<span class="lock">${kase.event}</span>，决定书文号：<span class="lock">${kase.doc_no}</span>）已由${kase.authority}依法作出信用修复决定，相关信息已于 ${kase.removed_date || '—'} 在国家企业信用信息公示系统停止公示。</p>
<p>截至本函发出之日，贵平台仍显示「${ch.note}」，与行政机关公示信息不一致，可能误导交易相对方，已对我方融资、投标等正常经营活动造成影响。依据《民法典》第一千零二十九条、《个人信息保护法》第四十六条及贵平台自身信息纠错规则，现提出如下请求：</p>
<p>一、请于收到本函之日起 3 个工作日内核实上述信息；</p>
<p>二、核实后立即更正或删除与行政机关公示不符的信息；</p>
<p>三、将处理结果书面（或邮件）告知我方。</p>
<p>随附：${kase.authority}移出决定（${kase.doc_no}）、信用修复状态凭证及核验二维码。如逾期未处理，我方将向网信、市场监管部门投诉，并保留追究相应法律责任的权利。</p>
<div class="sign">${ent.name}（盖章）<br>${cn(today)}</div>`;
}

async function createObjection(caseId, channelCode, bodyHtml) {
  const html = bodyHtml || await objectionHtml(caseId, channelCode);
  const r = await db.run('INSERT INTO objections (case_id, channel_code, body_html, status, sent_at) VALUES (?,?,?,?,NOW())',
    [caseId, channelCode, html, 'sent']);
  await db.run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?, NOW(), ?, ?, ?)',
    [caseId, '系统', `向${channelCode}发送数据异议函`, '要求 3 个工作日内更正']);
  return { id: r.insertId, html };
}

module.exports = { rescan, latest, objectionHtml, createObjection, observe, CHANNEL_STATE };
