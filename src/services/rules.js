'use strict';
/*
 * 规则引擎：把法定参数从代码里搬进 rule_params 表。
 * 法规修订时改数据不改代码 —— 这是「政策协同」在产品上的落点。
 */
const db = require('../db.js');
const caseTypes = require('./case-types.js');

// 等级只负责展示名称；最短公示期按「规则版本」的 definition.months 取值，
// 法规修订时改规则版本数据即可，不改代码。
const LEVELS = {
  minor: { code: 'minor', label: '轻微失信' },
  general: { code: 'general', label: '一般失信' },
  serious: { code: 'serious', label: '严重失信' },
  severe: { code: 'severe', label: '严重违法失信' }
};

// rule_params 的默认值：表里没配时用这套，配了以表为准
const PARAM_DEFAULTS = {
  // 107 号令第十一条第三项只要求「未因同一类违法行为再次受到处罚」，
  // 未设时间窗口。0 表示不作时间限制，历史记录一律纳入核查。
  no_similar_window_months: '0',
  required_conditions: 'obligation,rectify,nomore',
  // 107 号令第七条：经营主体 5 万元以下、相关责任人员 5000 元以下
  minor_fine_cap: '50000',
  person_fine_cap: '5000'
};

// 裁量阶次的展示名。法规原文只写了「从轻或者减轻处罚的裁量阶次」。
const DISCRETION_LABELS = {
  lighter: '从轻处罚',
  mitigated: '减轻处罚',
  normal: '一般（适中）处罚',
  heavier: '从重处罚'
};
const MINOR_DISCRETIONS = ['lighter', 'mitigated'];

const MATERIAL_TITLES = {
  apply: '信用修复申请书', subject: '申请人主体资格文件', promise: '守信承诺书',
  rectify: '整改情况说明', auth: '授权委托书', list: '材料目录与证明清单',
  plan: '整改计划书'
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
  cache = { ...PARAM_DEFAULTS, ...Object.fromEntries(rows.map(r => [r.pkey, r.pvalue])) };
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
 *  - 经营异常名录类：107 号令第十二条只要求「已补报/已改正」等情形之一，
 *    未规定公示期等待，故起算点取列入日，无等待期
 *  - 行政处罚类：最短公示期 = 决定作出日 + 分类月数（第七条/第八条/第九条）
 */
async function match(kase,today) {
  // 只有 L1（完整支持）类型才参与自动匹配；L2/L3 一律返回 null，由诊断层给出「暂不判断」
  if(!caseTypes.isAutoJudgeable(kase.type))return null;
  const rows=await db.all("SELECT * FROM rule_versions WHERE case_type=? AND level=? AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?) ORDER BY rule_key,version DESC",[kase.type,kase.level,today,today]);
  const latest=new Map();for(const r of rows)if(!latest.has(r.rule_key))latest.set(r.rule_key,r);
  const applicable=[...latest.values()].filter(r=>r.review_status==='reviewed'&&kase.authority?.includes(r.authority_match));
  // Multiple matching rules require explicit review instead of arbitrary selection.
  if(applicable.length!==1)return null;
  const r=applicable[0];r.definition=typeof r.definition==='string'?JSON.parse(r.definition):r.definition;return r;
}
async function applyFrom(kase,today=new Date().toISOString().slice(0,10),selected) {
  const r=selected||await match(kase,today);if(!r)return null;
  if(kase.type==='abnormal')return kase.listed_date||today;
  return kase.listed_date?addMonths(kase.listed_date,r.definition.months):null;
}

/**
 * 等级核实（只对行政处罚类生效）
 *
 * 107 号令第七条把「较低数额罚款」定义为两个必须同时成立的要件：
 *   (1) 按照从轻或者减轻处罚的裁量阶次作出；
 *   (2) 对经营主体处以五万元以下罚款（相关责任人员五千元以下）。
 *
 * 只采集金额会判错等级：同一笔 3 万元罚款，若是从轻阶次 → 轻微，公示期满
 * 三个月由机关停止公示、无需申请；若是一般阶次 → 一般失信，必须等满三个
 * 月才能申请。等级错，可申请日整个错位。所以这里不按金额单点判断，而是在
 * 登记值与法条要件冲突或缺项时，把结论降级为「待核实」，不发可申请日。
 */
function levelCheck(kase, levelCode, P) {
  if (kase.type !== 'penalty') return null;
  const cap = Number(P.minor_fine_cap) || 50000;
  const amount = kase.fine_amount == null || kase.fine_amount === '' ? null : Number(kase.fine_amount);
  const disc = kase.discretion || null;
  const discLabel = disc ? (DISCRETION_LABELS[disc] || disc) : '';
  const lowAmount = amount != null && amount <= cap;
  const lowDisc = MINOR_DISCRETIONS.includes(disc);

  if (levelCode === 'minor') {
    if (amount != null && amount > cap) return {
      state: 'conflict',
      text: `登记罚款 ${amount} 元，超过 107 号令第七条的较低数额上限 ${cap} 元，不构成轻微失信。请核对等级后重新登记，否则可申请日会算错。`
    };
    if (disc && !lowDisc) return {
      state: 'conflict',
      text: `登记的裁量阶次为「${discLabel}」，不属于 107 号令第七条要求的「从轻或者减轻处罚的裁量阶次」。即使罚款低于 ${cap} 元，也不构成轻微失信，应按一般等级计算最短公示期。`
    };
    if (amount == null || !disc) {
      const missing = [amount == null ? '罚款金额' : '', !disc ? '裁量阶次' : ''].filter(Boolean).join('、');
      return {
        state: 'unknown',
        text: `轻微失信须同时满足「从轻或减轻的裁量阶次」与「罚款 ${cap} 元以下」，当前缺少${missing}，等级无法核实，暂不给出可申请日。`
      };
    }
    return { state: 'ok', text: `罚款 ${amount} 元、裁量阶次为「${discLabel}」，符合 107 号令第七条的较低数额罚款口径，公示期满三个月由机关停止公示。` };
  }

  if (levelCode === 'general' || levelCode === 'serious') {
    if (lowAmount && lowDisc) return {
      state: 'warn',
      text: `罚款 ${amount} 元、裁量阶次为「${discLabel}」，可能符合 107 号令第七条的较低数额罚款情形。请核对决定书是否「仅处罚款、未并处其他处罚种类」：若确属轻微失信，公示期满三个月由机关停止公示，无需企业申请。`
    };
    if (amount != null || disc) return {
      state: 'ok',
      text: `罚款 ${amount != null ? amount + ' 元' : '金额未登记'}、裁量阶次${disc ? '为「' + discLabel + '」' : '未登记'}，不属于较低数额罚款情形，按${levelCode === 'serious' ? '严重' : '一般'}失信的法定最短公示期计算。`
    };
    return null;
  }
  return null;
}

async function evaluate(kase, today) {
  const selected=await match(kase,today);
  const from = await applyFrom(kase,today,selected);

  // 参数从 rule_params 读取，法规口径变化时改数据不改代码
  const P = await params();
  // 0 表示法规未设时间窗口，历史记录全部纳入核查
  const windowMonths = Number(P.no_similar_window_months) || 0;
  const requiredKeys = String(P.required_conditions || '').split(',').map(s => s.trim()).filter(Boolean);

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
    ? cond('nomore', '未因同一类违法行为再次受罚', 'met', windowMonths > 0 ? `近 ${windowMonths} 个月无同类处罚记录` : '未发现因同一类违法行为再次受罚的记录')
    : kase.no_new_similar === 0
      ? cond('nomore', '未因同一类违法行为再次受罚', 'unmet', '存在因同一类违法行为再次受罚的记录，暂不符合条件')
      : cond('nomore', '未因同一类违法行为再次受罚', 'unknown', windowMonths > 0 ? `需核查近 ${windowMonths} 个月是否存在同类处罚` : '需核查是否存在因同一类违法行为再次受罚的记录');

  // 哪些条件参与判定由 rule_params.required_conditions 决定；留空则三个全要
  const allConditions = [obligation, rectify, nomore];
  const conditions = requiredKeys.length
    ? allConditions.filter(c => requiredKeys.includes(c.key))
    : allConditions;
  const dateOk = Boolean(from && String(from).slice(0, 10) <= today);
  const unmet = conditions.filter(c => c.state === 'unmet');
  const unknown = conditions.filter(c => c.state === 'unknown');
  // 等级核实：轻微失信的成立要件不只是金额，冲突或缺项时不给结论
  const levelChecked = levelCheck(kase, kase.level, P);
  const levelIssue = Boolean(levelChecked && ['conflict', 'unknown'].includes(levelChecked.state));
  const eligible = Boolean(selected) && dateOk && unmet.length === 0 && unknown.length === 0 && !levelIssue;

  const status = !selected || levelIssue ? 'needs_review' : eligible ? 'eligible'
    : unmet.length ? 'blocked'
    : !dateOk ? 'not_yet'
    : 'pending_facts';

  const total = conditions.reduce((n, c) => n + (c.state === 'met' ? 1 : c.state === 'unknown' ? 0.5 : 0), 0);
  const score = Math.round(total / (conditions.length || 1) * 70 + (dateOk ? 30 : 10));

  const blockers = [];
  if(!selected){
    const t=caseTypes.get(kase.type);
    blockers.push({kind:'rule',text: t && t.level!=='L1'
      ? `「${t.label}」暂不提供自动判定：${t.note}`
      : '未找到唯一、已复核且在有效期内的适用规则；请核对事项类型、决定机关和规则版本，暂不判断可申请。'});
  }
  // 只有能自动判定的类型才追加日期与条件类阻塞项；L2/L3 只保留上面那条类型说明
  if (caseTypes.isAutoJudgeable(kase.type)) {
    if (levelChecked && (levelChecked.state === 'conflict' || levelChecked.state === 'unknown')) {
      blockers.push({ kind: levelChecked.state === 'conflict' ? 'level_conflict' : 'level_unknown', text: levelChecked.text });
    }
    if (!dateOk && from) blockers.push({ kind: 'date', text: selected?.definition?.autoStopOnly
      ? `公示期未满，预计 ${from} 由作出决定的机关停止公示（本情形无需企业申请）`
      : `最短公示期未满，${from} 后方可申请` });
    if (!from && selected) blockers.push({ kind: 'date', text: '缺少列入日期，无法计算起算点' });
    for (const c of conditions) {
      if (c.state === 'unmet') blockers.push({ kind: 'unmet', text: c.note });
      if (c.state === 'unknown') blockers.push({ kind: 'unknown', text: c.note });
    }
  }

  const meta = caseTypes.get(kase.type);
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
    rejectReasons:Array.isArray(selected?.definition.rejectReasons)?selected.definition.rejectReasons:[],
    // 法条依据：随规则版本一起维护，法规修订时改数据不改代码
    basis:Array.isArray(selected?.definition.basis)
      ? selected.definition.basis.map(b=>({law:b.law,text:b.text,url:selected.source_url}))
      : [],
    // 轻微失信信息公示期满自动停止，无需当事人申请
    autoStopOnly:Boolean(selected?.definition.autoStopOnly),
    // 等级核实结果：说明「凭什么判成这个等级」，以及登记值与法条口径是否冲突
    levelCheck:levelChecked?{
      state:levelChecked.state,
      text:levelChecked.text,
      fineAmount:kase.fine_amount==null?null:Number(kase.fine_amount),
      fineCap:Number(P.minor_fine_cap)||50000,
      discretion:kase.discretion||null,
      discretionLabel:kase.discretion?(DISCRETION_LABELS[kase.discretion]||kase.discretion):null
    }:null,
    support:meta?{
      code:meta.code,label:meta.label,support:meta.level,
      supportLabel:caseTypes.supportLabel(meta.code),
      autoJudgeable:meta.level==='L1',
      authority:meta.authority,channel:meta.channel,note:meta.note
    }:null,
    materials:(selected?.definition.materials||meta?.materials||MATERIALS[kase.level]||[]).map(key=>({key,title:MATERIAL_TITLES[key]||key}))
  };
}

module.exports = { LEVELS, MATERIALS, MATERIAL_TITLES, DISCRETION_LABELS, MINOR_DISCRETIONS, params, invalidate, match, applyFrom, evaluate, levelCheck, addMonths, addDays, diffDays };
