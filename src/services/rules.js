'use strict';
/*
 * 规则引擎：把法定参数从代码里搬进 rule_params 表。
 * 法规修订时改数据不改代码 —— 这是「政策协同」在产品上的落点。
 */
const db = require('../db.js');

const LEVELS = {
  minor: { code: 'minor', label: '轻微失信', months: 3 },
  general: { code: 'general', label: '一般失信', months: 6 },
  serious: { code: 'serious', label: '严重失信', months: 12 },
  severe: { code: 'severe', label: '严重违法失信', months: 36 }
};

const MATERIAL_TITLES = {
  apply: '信用修复申请书', promise: '守信承诺书', rectify: '整改情况说明',
  auth: '授权委托书', list: '材料目录与证明清单', plan: '整改计划书'
};

const MATERIALS = {
  minor: ['apply', 'promise', 'rectify', 'auth', 'list'],
  general: ['apply', 'promise', 'rectify', 'auth', 'list'],
  serious: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan'],
  severe: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan']
};

let cache = null;
let cacheAt = 0;

async function params() {
  if (cache && Date.now() - cacheAt < 60e3) return cache;
  const rows = await db.all('SELECT pkey, pvalue FROM rule_params');
  cache = Object.fromEntries(rows.map(r => [r.pkey, r.pvalue]));
  cacheAt = Date.now();
  return cache;
}

function invalidate() { cache = null; }

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day=d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
}

/**
 * 可申请日：
 *  - 经营异常名录类：移出之日即满足（补报义务已履行）
 *  - 行政处罚类：最短公示期 = 决定作出日 + 分级月数
 */
async function match(kase,today) {
  if(!['penalty','abnormal'].includes(kase.type))return null;
  const rows=await db.all("SELECT * FROM rule_versions WHERE case_type=? AND level=? AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?) ORDER BY rule_key,version DESC",[kase.type,kase.level,today,today]);
  const latest=new Map();for(const r of rows)if(!latest.has(r.rule_key))latest.set(r.rule_key,r);
  const applicable=[...latest.values()].filter(r=>r.review_status==='reviewed'&&kase.authority?.includes(r.authority_match));
  // Multiple matching rules require explicit review instead of arbitrary selection.
  if(applicable.length!==1)return null;
  const r=applicable[0];r.definition=typeof r.definition==='string'?JSON.parse(r.definition):r.definition;return r;
}
async function applyFrom(kase,today=new Date().toISOString().slice(0,10),selected) {
  const r=selected||await match(kase,today);if(!r)return null;
  if(kase.type==='abnormal')return kase.removed_date||null;
  return kase.listed_date?addMonths(kase.listed_date,r.definition.months):null;
}

async function evaluate(kase, today) {
  const selected=await match(kase,today);
  const from = await applyFrom(kase,today,selected);

  // 三态：met 已满足 / unmet 明确不满足 / unknown 事实缺失
  const cond = (key, name, state, note) => ({ key, name, state, pass: state === 'met', note });

  let obligation;
  if (kase.type==='abnormal' && kase.removed_date) obligation = cond('obligation', '已履行相关义务', 'met', `已于 ${kase.removed_date} 移出经营异常名录`);
  else if (kase.obligation_at) obligation = cond('obligation', '已履行相关义务', 'met', `义务履行完成日 ${kase.obligation_at}`);
  else obligation = cond('obligation', '已履行相关义务', 'unknown', kase.type === 'penalty' ? '缺少缴款凭证或履行证明' : '尚未取得移出决定');

  const rectify = kase.rectified === 1
    ? cond('rectify', '整改措施已落实', 'met', kase.rectify_at ? `整改完成于 ${kase.rectify_at}` : '已登记整改完成')
    : kase.rectified === 0
      ? cond('rectify', '整改措施已落实', 'unmet', '已登记为未完成，需先完成整改')
      : cond('rectify', '整改措施已落实', 'unknown', '尚未确认整改情况');

  const nomore = kase.no_new_similar === 1
    ? cond('nomore', '无新增同类失信', 'met', '近 12 个月无同类记录')
    : kase.no_new_similar === 0
      ? cond('nomore', '无新增同类失信', 'unmet', '近 12 个月存在新增同类失信，暂不符合条件')
      : cond('nomore', '无新增同类失信', 'unknown', '需核查近 12 个月信用记录');

  const conditions = [obligation, rectify, nomore];
  const dateOk = Boolean(from && String(from).slice(0, 10) <= today);
  const unmet = conditions.filter(c => c.state === 'unmet');
  const unknown = conditions.filter(c => c.state === 'unknown');
  const eligible = Boolean(selected) && dateOk && unmet.length === 0 && unknown.length === 0;

  const status = !selected ? 'needs_review' : eligible ? 'eligible'
    : unmet.length ? 'blocked'
    : !dateOk ? 'not_yet'
    : 'pending_facts';

  const total = conditions.reduce((n, c) => n + (c.state === 'met' ? 1 : c.state === 'unknown' ? 0.5 : 0), 0);
  const score = Math.round(total / conditions.length * 70 + (dateOk ? 30 : 10));

  const blockers = [];
  if(!selected)blockers.push({kind:'rule',text:'未找到唯一、已复核且在有效期内的适用规则；请核对事项类型、决定机关和规则版本，暂不判断可申请。'});
  if (!dateOk && from) blockers.push({ kind: 'date', text: `最短公示期未满，${from} 后方可申请${kase.type === 'penalty' ? '' : '（以移出日期起算）'}` });
  if (!from && selected) blockers.push({ kind: 'date', text: kase.type==='abnormal'?'尚未登记移出日期，需核对办理路径':'缺少列入日期，无法计算最短公示期' });
  for (const c of conditions) {
    if (c.state === 'unmet') blockers.push({ kind: 'unmet', text: c.note });
    if (c.state === 'unknown') blockers.push({ kind: 'unknown', text: c.note });
  }

  return {
    level: LEVELS[kase.level] || LEVELS.general,
    applyFrom: from,
    eligible,
    status,
    waitDays: from && from > today ? diffDays(from, today) : 0,
    conditions,
    blockers,
    score,
    ruleVersion:selected,
    reviewDays:selected?.definition.reviewDays??null,
    materials:(selected?.definition.materials||(['penalty','abnormal'].includes(kase.type)?MATERIALS[kase.level]||[]:[])).map(key=>({key,title:MATERIAL_TITLES[key]||key}))
  };
}

module.exports = { LEVELS, MATERIALS, MATERIAL_TITLES, params, invalidate, match, applyFrom, evaluate, addMonths, addDays, diffDays };
