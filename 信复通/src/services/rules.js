'use strict';
/*
 * 规则引擎：把法定参数从代码里搬进 rule_params 表。
 * 法规修订时改数据不改代码 —— 这是「政策协同」在产品上的落点。
 */
const db = require('../db.js');
const caseTypes = require('./case-types.js');
const legal = require('./legal.js');

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
  // 未设具体时间窗口；不据此推断应回溯全部历史。
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
function maxDate(a, b) { return a && b ? (a > b ? a : b) : (a || b || null); }

function parseDetail(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function snapshotOf(kase, scope) {
  if (scope === 'penalty_kind') return {
    penalty_type: kase.penalty_type || null,
    key_field: kase.key_field === 0 || kase.key_field === 1 ? Number(kase.key_field) : null,
    restrict_until: kase.restrict_until || null,
    level: kase.level || null
  };
  if (scope === 'abnormal_reason') return { abnormal_reason: kase.abnormal_reason || null, level: kase.level || null };
  if (scope === 'dates') return {
    start_basis: kase.start_basis || null,
    decision_date: kase.decision_date || null,
    publicity_date: kase.publicity_date || null,
    listed_date: kase.listed_date || null
  };
  return null;
}

function sameSnapshot(a, b) {
  if (!a || !b) return false;
  return Object.keys(b).every(k => String(a[k] ?? '') === String(b[k] ?? ''));
}

/**
 * 人工核实记录只在「核实时的字段快照」与当前登记一致时采信。
 * 事实一改，旧记录自动失效，避免把上一次的核实结论套到新事实上。
 */
async function verifications(caseId) {
  if (!caseId) return [];
  const rows = await db.all('SELECT * FROM case_verifications WHERE case_id=? ORDER BY id DESC', [caseId]);
  return rows.map(r => ({ ...r, detail: parseDetail(r.detail) }));
}

function verifiedFor(list, scope, snapshot) {
  return list.find(v => v.scope === scope && v.conclusion !== 'not_applicable' && sameSnapshot(v.detail, snapshot)) || null;
}

async function otherPenalties(kase) {
  if (!kase.enterprise_id) return [];
  return db.all(
    "SELECT id,doc_no,event,authority,level,listed_date,decision_date,publicity_date FROM cases WHERE enterprise_id=? AND type='penalty' AND id<>? ORDER BY COALESCE(decision_date,listed_date) DESC",
    [kase.enterprise_id, kase.id || '']
  );
}

async function applyFrom(kase,today=new Date().toISOString().slice(0,10),selected) {
  const r=selected||await match(kase,today);if(!r)return null;
  if(kase.type==='abnormal')return null;
  const start=legal.startInfo(kase);if(start.ambiguous||!start.date)return null;
  const cls=legal.classification(kase,r.rule_key);
  if(cls?.serious?.code==='third')return addMonths(start.date,36);
  if(cls?.serious?.code==='second'&&kase.restrict_until)return maxDate(addMonths(start.date,r.definition.months||12),kase.restrict_until);
  if(r.rule_key==='penalty-minor-107'&&kase.penalty_type==='warning')return null;
  return addMonths(start.date,r.definition.months||0);
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
  const key=selected?.rule_key||'';
  const P = await params();
  // 0 表示不展示自定义时间窗口；同类认定及实际回溯范围须人工核实。
  const windowMonths = Number(P.no_similar_window_months) || 0;
  const requiredKeys = String(P.required_conditions || '').split(',').map(s => s.trim()).filter(Boolean);

  const start = legal.startInfo(kase);
  // 细分核实只针对严重处罚和经营异常；一般/轻微处罚不因登记种类而被反复要求核实
  const cls = kase.type === 'abnormal' || kase.level === 'serious' || kase.level === 'severe' || key === 'penalty-minor-107'
    ? legal.classification(kase, key) : null;
  const sc = cls?.serious || null;
  // 107 号令第八条第三项：只能等三年期满停止公示，不能申请提前修复
  const autoStopOnly = Boolean(selected?.definition?.autoStopOnly) || sc?.code === 'third';
  const noPublicity = key === 'penalty-minor-107' && kase.penalty_type === 'warning';
  const historicalReview = /-107$/.test(key) && Boolean(start.date && start.date < legal.RULE_EFFECTIVE);
  const reviewRequired = Boolean(cls && (cls.required || !cls.complete)) || start.ambiguous;

  let from = null;
  if (selected && start.date && !start.ambiguous) {
    if (kase.type === 'abnormal') from = null;
    else if (sc?.code === 'third') from = addMonths(start.date, 36);
    else if (sc?.code === 'second') from = maxDate(addMonths(start.date, selected.definition.months || 12), kase.restrict_until);
    else if (noPublicity) from = null;
    else from = addMonths(start.date, selected.definition.months || 0);
  }

  const list = await verifications(kase.id);
  const others = kase.type === 'penalty' && kase.no_new_similar === 1 ? await otherPenalties(kase) : [];
  const similarVerification = list.find(v => v.scope === 'similar_history') || null;
  const pendingScopes = [];
  if (cls?.complete && !verifiedFor(list, cls.scope, snapshotOf(kase, cls.scope))) pendingScopes.push(cls.scope);
  if (others.length && !similarVerification) pendingScopes.push('similar_history');
  const verificationScopes = [];
  if (cls?.complete) verificationScopes.push(cls.scope);
  if (others.length) verificationScopes.push('similar_history');
  // 无需申请或不能提前申请的情形不要求核实「能不能申请」，避免无意义的待办
  if (autoStopOnly) { pendingScopes.length = 0; verificationScopes.length = 0; }
  const verificationPending = pendingScopes.length > 0;

  // 三态：met 已满足 / unmet 明确不满足 / unknown 事实缺失
  const cond = (key, name, state, note) => ({ key, name, state, pass: state === 'met', note });

  let obligation;
  if (kase.type==='abnormal' && kase.removed_date) obligation = cond('obligation', '已履行相关义务', 'met', `已于 ${kase.removed_date} 移出经营异常名录`);
  else if (kase.obligation_at) obligation = cond('obligation', '已履行相关义务', 'met', `义务履行完成日 ${kase.obligation_at}`);
  else obligation = cond('obligation', '已履行相关义务', 'unknown', kase.type === 'penalty' ? '缺少缴款凭证或履行证明' : '请按列入原因核对补报、公示、变更登记或恢复联系等整改及证明');

  const rectify = kase.rectified === 1
    ? cond('rectify', '整改措施已落实', 'met', kase.rectify_at ? `整改完成于 ${kase.rectify_at}` : '已登记整改完成')
    : kase.rectified === 0
      ? cond('rectify', '整改措施已落实', 'unmet', '已登记为未完成，需先完成整改')
      : cond('rectify', '整改措施已落实', 'unknown', '尚未确认整改情况');

  const rangeText = v => {
    const m = Number(v?.detail?.months) || 0;
    return m > 0 ? `回溯 ${m} 个月内的历史处罚` : '全部历史处罚';
  };
  let nomore;
  if (similarVerification) {
    nomore = similarVerification.conclusion === 'exists'
      ? cond('nomore', '未因同一类违法行为再次受罚', 'unmet', `人工核实（${rangeText(similarVerification)}）存在同类再次处罚：${similarVerification.note}`)
      : cond('nomore', '未因同一类违法行为再次受罚', 'met', `人工核实（${rangeText(similarVerification)}）未发现同类再次处罚`);
  } else if (kase.no_new_similar === 1) {
    nomore = others.length
      ? cond('nomore', '未因同一类违法行为再次受罚', 'unknown', `企业登记无同类处罚，但本企业另有 ${others.length} 条历史处罚记录；请完成同类对照并记录核实结论`)
      : cond('nomore', '未因同一类违法行为再次受罚', 'met', windowMonths > 0 ? `企业人工登记：近 ${windowMonths} 个月无同类处罚；范围和同类认定请向主管机关核实` : '企业人工登记：无同类再次处罚；是否同类及核查范围请向主管机关确认');
  } else if (kase.no_new_similar === 0) {
    nomore = cond('nomore', '未因同一类违法行为再次受罚', 'unmet', '存在因同一类违法行为再次受罚的记录，暂不符合条件');
  } else {
    nomore = cond('nomore', '未因同一类违法行为再次受罚', 'unknown', windowMonths > 0 ? `需核查近 ${windowMonths} 个月是否存在同类处罚` : '需核查是否存在因同一类违法行为再次受罚的记录');
  }

  // 哪些条件参与判定由 rule_params.required_conditions 决定；留空则三个全要
  const allConditions = kase.type==='abnormal' ? [rectify] : [obligation, rectify, nomore];
  const conditions = requiredKeys.length
    ? allConditions.filter(c => requiredKeys.includes(c.key))
    : allConditions;
  const dateOk = kase.type === 'abnormal'
    ? Boolean(selected && !start.ambiguous)
    : Boolean(from && String(from).slice(0, 10) <= today);
  const unmet = conditions.filter(c => c.state === 'unmet');
  const unknown = conditions.filter(c => c.state === 'unknown');

  // 等级核实：轻微失信的成立要件不只是金额，冲突或缺项时不给结论
  let levelChecked = levelCheck(kase, kase.level, P);
  if (cls) {
    if (key === 'penalty-serious-107') {
      levelChecked = { state: cls.complete ? 'ok' : 'unknown', text: cls.text };
    } else if (key === 'penalty-minor-107') {
      if (kase.penalty_type && !legal.MINOR_TYPES.has(kase.penalty_type)) levelChecked = { state: 'conflict', text: cls.text };
      else if (kase.penalty_type === 'warning' || kase.penalty_type === 'circular') levelChecked = { state: 'ok', text: cls.text };
      else if (cls.complete && levelChecked?.state === 'ok') levelChecked = { state: 'ok', text: `${cls.text}${levelChecked.text}` };
      else if (!cls.complete) levelChecked = { state: 'unknown', text: cls.text };
    }
  }
  const levelIssue = Boolean(levelChecked && ['conflict', 'unknown'].includes(levelChecked.state));
  const eligible = Boolean(selected) && !autoStopOnly && !reviewRequired && !historicalReview && !verificationPending && dateOk && unmet.length === 0 && unknown.length === 0 && !levelIssue;

  const status = !selected || levelIssue || reviewRequired || historicalReview ? 'needs_review'
    : verificationPending ? 'needs_verification'
    : autoStopOnly ? 'auto_stop'
    : eligible ? 'eligible'
    : unmet.length ? 'blocked'
    : !dateOk ? 'not_yet'
    : 'pending_facts';

  const total = conditions.reduce((n, c) => n + (c.state === 'met' ? 1 : c.state === 'unknown' ? 0.5 : 0), 0);
  const score = Math.round(total / (conditions.length || 1) * 70 + (dateOk ? 30 : 10));

  const scopeLabel = { penalty_kind: '处罚种类核实', abnormal_reason: '经营异常列入原因核实', similar_history: '同类历史处罚对照', dates: '起算依据核实' };
  const blockers = [];
  if (reviewRequired) blockers.push({ kind: 'review', text: cls ? cls.text : '处罚决定日期与实际公示日期不一致，请明确最短公示期的起算依据。' });
  if (historicalReview) blockers.push({ kind: 'historical', text: `起算日期 ${start.date} 早于本规则生效日 ${legal.RULE_EFFECTIVE}，请结合决定书、实际公示日期和当时适用的部门规定核实新旧规则，暂不自动给出可申请结论。` });
  if (verificationPending) blockers.push({ kind: 'verification', text: `已登记结构化信息，请补充人工核实结论：${pendingScopes.map(s => scopeLabel[s] || s).join('、')}。核实记录须关联依据材料，并会在字段变更后自动失效。` });
  if (!selected){
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
    if (!dateOk && from) blockers.push({ kind: 'date', text: autoStopOnly
      ? `公示期未满，预计 ${from} 由作出决定的机关停止公示（本情形无需企业申请）`
      : `按${start.basisLabel || '登记日期'}推算的参考日期为 ${from}；起算依据和适用规则须向主管机关核实` });
    if (!from && !dateOk && selected && kase.type!=='abnormal' && !autoStopOnly && !noPublicity) blockers.push({ kind: 'date', text: start.ambiguous ? '存在两个不同日期，请选择起算依据' : `缺少${start.basisLabel || '起算日期'}，无法计算参考日期` });
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
    reviewDays:autoStopOnly?null:(selected?.definition.reviewDays??null),
    rejectReasons:Array.isArray(selected?.definition.rejectReasons)?selected.definition.rejectReasons:[],
    // 法条依据：随规则版本一起维护，法规修订时改数据不改代码
    basis:Array.isArray(selected?.definition.basis)
      ? selected.definition.basis.map(b=>({law:b.law,text:b.text,url:selected.source_url}))
      : [],
    // 轻微失信/吊销证照等无需申请、到期停止公示的情形
    autoStopOnly,
    noPublicity,
    // 严重处罚细分与经营异常原因的结构化核实结果
    classification: cls ? {
      scope: cls.scope, complete: cls.complete, required: cls.required, text: cls.text,
      seriousCode: sc?.code || null,
      penaltyType: kase.penalty_type || null,
      penaltyTypeLabel: kase.penalty_type ? (legal.PENALTY_MAP[kase.penalty_type]?.label || kase.penalty_type) : null,
      keyField: kase.key_field === 0 || kase.key_field === 1 ? Number(kase.key_field) : null,
      restrictUntil: kase.restrict_until || null,
      abnormalReason: kase.abnormal_reason || null,
      abnormalReasonLabel: kase.abnormal_reason ? (legal.ABNORMAL_MAP[kase.abnormal_reason]?.label || kase.abnormal_reason) : null
    } : null,
    // 起算依据：决定作出日、实际公示日、平台登记日分别呈现
    dateInfo: {
      basis: start.basis, basisLabel: start.basisLabel, startDate: start.date,
      decisionDate: kase.decision_date || null, publicityDate: kase.publicity_date || null,
      listedDate: kase.listed_date || null, ambiguous: start.ambiguous, missing: start.missing,
      historical: historicalReview
    },
    // 人工核实：哪些范围需要记录、还缺哪些
    verification: {
      required: verificationScopes, pending: pendingScopes,
      verified: verificationScopes.length > 0 && pendingScopes.length === 0,
      latest: list.slice(0, 5).map(v => ({ id: v.id, scope: v.scope, conclusion: v.conclusion, note: v.note, created_at: v.created_at }))
    },
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
    // 材料按事项类型、处罚种类/异常原因、实际办理路径筛选，并标注法定/条件性/辅助
    materials: (selected
      ? legal.materialPlan(kase, selected, autoStopOnly)
      : (meta?.materials || MATERIALS[kase.level] || []).map(key => ({ key, title: MATERIAL_TITLES[key] || key, category: 'statutory', categoryLabel: '参考材料', required: false, note: null }))
    ).map(m => ({ ...m, title: MATERIAL_TITLES[m.key] || m.title })),
    requiredEvidence: legal.requiredEvidence(kase, key),
    otherPenalties: others.length,
    windowMonths
  };
}

module.exports = { LEVELS, MATERIALS, MATERIAL_TITLES, DISCRETION_LABELS, MINOR_DISCRETIONS, params, invalidate, match, applyFrom, evaluate, levelCheck, addMonths, addDays, diffDays, snapshotOf };
