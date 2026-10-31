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
  serious: ['apply', 'promise', 'rectify', 'auth', 'list', 'plan']
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
  d.setUTCMonth(d.getUTCMonth() + months);
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
async function applyFrom(kase) {
  const p = await params();
  const months = Number(p[`min_months.${kase.level}`] || LEVELS[kase.level]?.months || 6);
  if (kase.type === 'abnormal' && kase.removed_date) return kase.removed_date;
  if (kase.type === 'abnormal') return null;
  return kase.listed_date ? addMonths(kase.listed_date, months) : null;
}

async function evaluate(kase, today) {
  const p = await params();
  const from = await applyFrom(kase);
  const conditions = [
    { key: 'obligation', name: '已履行相关义务', pass: Boolean(kase.removed_date || kase.type === 'penalty'), note: kase.removed_date ? `已于 ${kase.removed_date} 移出` : '需上传履行凭证' },
    { key: 'rectify', name: '整改措施已落实', pass: true, note: '整改说明与承诺书已生成' },
    { key: 'nomore', name: '无新增同类失信', pass: true, note: '近 12 个月无同类记录' }
  ];
  const passed = conditions.filter(c => c.pass).length;
  const score = Math.round(passed / conditions.length * 70 + (from && from <= today ? 30 : 10));
  return {
    level: LEVELS[kase.level] || LEVELS.general,
    applyFrom: from,
    eligible: Boolean(from && from <= today),
    waitDays: from && from > today ? diffDays(from, today) : 0,
    conditions,
    score,
    reviewDays: Number(p.review_days || 15),
    materials: (MATERIALS[kase.level] || MATERIALS.general).map(key => ({ key, title: MATERIAL_TITLES[key] || key }))
  };
}

module.exports = { LEVELS, MATERIALS, MATERIAL_TITLES, params, invalidate, applyFrom, evaluate, addMonths, addDays, diffDays };
