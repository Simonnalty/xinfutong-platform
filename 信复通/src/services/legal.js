'use strict';
/*
 * 法条口径字典：处罚种类、经营异常列入原因、起算依据、材料分类。
 *
 * 这些是《市场监督管理信用修复管理办法》（总局令第107号）的结构化口径，
 * 不是可由企业自由勾选的标签：
 *  - 第八条把严重违法失信信息分成三项，第二项还要求「限制期限届满」，
 *    第三项只能等三年期满停止公示，不能申请提前修复；
 *  - 第十二条按「列入原因」对应不同的整改义务，证明材料不能互相替代；
 *  - 最短公示期的起算点须区分决定作出日、实际公示日和平台登记日。
 * 规则引擎只根据这里登记的结构化字段给出结论；缺少字段时一律待核实。
 */

const RULE_EFFECTIVE = '2025-12-25';

// 严重失信三类：first 重点领域 / second 限制生产经营 / third 降低资质、吊销证照
const PENALTY_TYPES = [
  { code: 'warning', label: '警告', group: 'minor', earlyApply: false, note: '仅受到警告的行政处罚信息不予公示' },
  { code: 'circular', label: '通报批评', group: 'minor', earlyApply: false, note: '仅受到通报批评的，公示期满三个月由机关停止公示' },
  { code: 'fine', label: '罚款', group: 'general', earlyApply: true, note: '仅处罚款的，须结合金额与裁量阶次判断等级' },
  { code: 'restrict_business', label: '限制开展生产经营活动', group: 'second', earlyApply: true, restrict: true, note: '须同时满足限制期限届满' },
  { code: 'suspend_business', label: '责令停产停业', group: 'second', earlyApply: true, restrict: true, note: '须同时满足限制期限届满' },
  { code: 'restrict_practice', label: '限制从业', group: 'second', earlyApply: true, restrict: true, note: '须同时满足限制期限届满' },
  { code: 'lower_qualification', label: '降低资质等级', group: 'third', earlyApply: false, note: '只能待公示期满三年停止公示，不能申请提前修复' },
  { code: 'revoke_license', label: '吊销许可证件', group: 'third', earlyApply: false, note: '只能待公示期满三年停止公示，不能申请提前修复' },
  { code: 'revoke_business_license', label: '吊销营业执照', group: 'third', earlyApply: false, note: '只能待公示期满三年停止公示，不能申请提前修复' },
  { code: 'close_down', label: '责令关闭', group: 'third', earlyApply: false, note: '只能待公示期满三年停止公示，不能申请提前修复' },
  { code: 'other', label: '其他行政处罚', group: 'general', earlyApply: true, note: '须结合决定书载明的处罚种类核实' }
];
const PENALTY_MAP = Object.fromEntries(PENALTY_TYPES.map(t => [t.code, t]));
const THIRD_TYPES = new Set(PENALTY_TYPES.filter(t => t.group === 'third').map(t => t.code));
const SECOND_TYPES = new Set(PENALTY_TYPES.filter(t => t.group === 'second').map(t => t.code));
const MINOR_TYPES = new Set(['warning', 'circular', 'fine']);

// 重点领域：食品、药品、医疗器械、化妆品、特种设备、重点工业产品（107 号令第八条第一项）
const KEY_FIELDS = [
  { code: 'food', label: '食品' },
  { code: 'drug', label: '药品' },
  { code: 'device', label: '医疗器械' },
  { code: 'cosmetic', label: '化妆品' },
  { code: 'special_equipment', label: '特种设备' },
  { code: 'key_industrial', label: '重点工业产品' }
];

// 经营异常名录列入原因（107 号令第十二条五种情形）
const ABNORMAL_REASONS = [
  {
    code: 'annual_report', label: '未按期公示年度报告', proof: '补报未报年份年度报告并公示的证明',
    evidenceKind: 'annual_report', evidenceLabel: '补报年报及公示证明',
    rule: '补报并公示未报年份年度报告'
  },
  {
    code: 'publicity', label: '未履行责令期限内的信息公示义务', proof: '已履行信息公示义务的证明',
    evidenceKind: 'publicity', evidenceLabel: '信息公示义务履行证明',
    rule: '履行市场监督管理部门责令期限内的信息公示义务'
  },
  {
    code: 'name_change', label: '企业名称变更未办理登记', proof: '企业名称变更登记证明',
    evidenceKind: 'name_change', evidenceLabel: '名称变更登记证明',
    rule: '依法完成企业名称变更登记'
  },
  {
    code: 'address', label: '通过登记住所/经营场所无法取得联系', proof: '住所变更登记或重新取得联系的证明',
    evidenceKind: 'address', evidenceLabel: '住所变更或重新取得联系证明',
    rule: '完成住所变更登记或重新取得联系'
  },
  {
    code: 'other', label: '其他违法行为', proof: '已改正违法行为的证明',
    evidenceKind: 'rectification', evidenceLabel: '整改证明',
    rule: '改正其他违法行为'
  }
];
const ABNORMAL_MAP = Object.fromEntries(ABNORMAL_REASONS.map(r => [r.code, r]));

// 最短公示期起算依据。不能把「信用中国公示日期」当成所有机关、所有情形的统一起算点。
const DATE_BASES = [
  { code: 'decision', label: '行政处罚决定作出之日', field: 'decision_date' },
  { code: 'publicity', label: '实际公示之日', field: 'publicity_date' },
  { code: 'listed', label: '平台原登记的列入/决定日期', field: 'listed_date' }
];

// 人工核实范围与可选结论。核实结论必须写明依据，不因用户自述而直接视为满足条件。
const VERIFICATION_SCOPES = ['penalty_kind', 'abnormal_reason', 'similar_history', 'dates'];
const VERIFICATION_CONCLUSIONS = {
  penalty_kind: [
    { code: 'confirmed', label: '已对照处罚决定书确认处罚种类、领域与限制期限' },
    { code: 'need_more', label: '依据不足，需补充材料' }
  ],
  abnormal_reason: [
    { code: 'matched', label: '列入原因与整改事项、证明材料已对应' },
    { code: 'missing', label: '证明缺失或与列入原因不符' }
  ],
  similar_history: [
    { code: 'none', label: '回溯范围内未发现同类处罚' },
    { code: 'exists', label: '发现同类再次处罚' }
  ],
  dates: [
    { code: 'confirmed', label: '决定日期、公示日期与起算依据已确认' },
    { code: 'ambiguous', label: '日期冲突或依据不明，需向机关确认' }
  ]
};

const MATERIAL_META = {
  apply: { category: 'statutory', label: '申请材料' },
  subject: { category: 'statutory', label: '申请材料' },
  promise: { category: 'statutory', label: '申请材料' },
  rectify: { category: 'statutory', label: '申请材料' },
  auth: { category: 'conditional', label: '条件性材料', condition: '委托他人办理时提供' },
  list: { category: 'auxiliary', label: '辅助材料' },
  plan: { category: 'auxiliary', label: '辅助材料' }
};

function seriousClass(kase) {
  const t = kase.penalty_type;
  if (!t) return { code: null, required: true, text: '尚未登记处罚种类。请按决定书选择具体种类及是否属于重点领域。' };
  if (!PENALTY_MAP[t]) return { code: null, required: true, text: '处罚种类取值不正确，请重新登记。' };
  if (THIRD_TYPES.has(t)) return {
    code: 'third', type: PENALTY_MAP[t],
    text: `属于「${PENALTY_MAP[t].label}」，依 107 号令第八条第三项，只能待公示期满三年由机关停止公示，不能申请提前修复。`
  };
  if (SECOND_TYPES.has(t)) {
    if (!kase.restrict_until) return {
      code: 'second', required: true, type: PENALTY_MAP[t],
      text: `属于「${PENALTY_MAP[t].label}」，除公示期满一年外，还须行政处罚限制期限届满。请登记限制期限届满日。`
    };
    return {
      code: 'second', type: PENALTY_MAP[t],
      text: `属于「${PENALTY_MAP[t].label}」，须同时满足公示期满一年且限制期限（至 ${kase.restrict_until}）届满。`
    };
  }
  if (kase.key_field === 1) return {
    code: 'first', type: PENALTY_MAP[t],
    text: `属于重点领域（食品、药品、医疗器械、化妆品、特种设备、重点工业产品），公示期满一年可申请修复。`
  };
  if (kase.key_field === 0) return {
    code: 'outside', required: true, type: PENALTY_MAP[t],
    text: '该处罚种类不属于第八条第二、三项；如也不属于重点领域，则不构成第八条规定的严重失信信息，请核对是否应定为一般失信。'
  };
  return {
    code: null, required: true, type: PENALTY_MAP[t],
    text: '请确认该处罚是否涉及食品、药品、医疗器械、化妆品、特种设备、重点工业产品领域。'
  };
}

function classification(kase, key) {
  // 以事项等级/类型判断，而不是依赖某个规则键名：规则可换版本，法定义务不随之改变。
  if (kase.type !== 'abnormal' && (kase.level === 'serious' || kase.level === 'severe')) {
    const sc = seriousClass(kase);
    return { scope: 'penalty_kind', complete: !sc.required && sc.code !== 'outside', required: Boolean(sc.required), text: sc.text, serious: sc };
  }
  if (key === 'penalty-minor-107') {
    const t = kase.penalty_type;
    if (!t) return { scope: 'penalty_kind', complete: false, required: true, text: '尚未登记处罚种类，无法确认是否属于无需申请、到期停止公示的情形。' };
    if (!MINOR_TYPES.has(t)) return {
      scope: 'penalty_kind', complete: false, required: true,
      text: `登记为「${PENALTY_MAP[t]?.label || t}」，不属于轻微失信常见的警告、通报批评或仅罚款情形，请核对等级。`
    };
    const base = t === 'warning' ? '仅受到警告的行政处罚信息不予公示，无需办理。'
      : `属于「${PENALTY_MAP[t].label}」，公示期满三个月由机关停止公示，无需申请。`;
    if (t === 'fine' && (kase.fine_amount == null || !kase.discretion)) {
      return { scope: 'penalty_kind', complete: false, required: true, text: base + '仅罚款还须核实金额与裁量阶次。' };
    }
    return { scope: 'penalty_kind', complete: true, required: false, text: base };
  }
  if (kase.type === 'abnormal') {
    const r = ABNORMAL_MAP[kase.abnormal_reason];
    if (!r) return {
      scope: 'abnormal_reason', complete: false, required: true,
      text: '尚未登记经营异常名录列入原因，无法核对对应的整改义务和证明材料。'
    };
    return {
      scope: 'abnormal_reason', complete: true, required: false, reason: r,
      text: `列入原因「${r.label}」，应完成「${r.rule}」，并上传「${r.evidenceLabel}」。`
    };
  }
  return null;
}

function startInfo(kase) {
  const basis = DATE_BASES.find(b => b.code === kase.start_basis);
  if (basis) {
    const date = kase[basis.field] || null;
    return { basis: basis.code, basisLabel: basis.label, date, missing: !date, ambiguous: false };
  }
  if (kase.decision_date && kase.publicity_date && kase.decision_date !== kase.publicity_date) {
    return { basis: null, basisLabel: '', date: null, missing: false, ambiguous: true };
  }
  const date = kase.decision_date || kase.publicity_date || kase.listed_date || null;
  const code = kase.decision_date ? 'decision' : kase.publicity_date ? 'publicity' : 'listed';
  const found = DATE_BASES.find(b => b.code === code);
  return { basis: code, basisLabel: found.label, date, missing: !date, ambiguous: false };
}

function materialPlan(kase, selected, autoStopOnly) {
  if (!selected || autoStopOnly) return [];
  const keys = Array.isArray(selected.definition?.materials) && selected.definition.materials.length
    ? selected.definition.materials.slice()
    : ['apply', 'subject', 'promise', 'rectify'];
  for (const extra of ['auth', 'list']) if (!keys.includes(extra)) keys.push(extra);
  const reason = ABNORMAL_MAP[kase.abnormal_reason];
  return keys.map(key => {
    const meta = MATERIAL_META[key] || { category: 'auxiliary', label: '辅助材料' };
    const item = {
      key,
      title: require('./rules.js').MATERIAL_TITLES[key] || key,
      category: meta.category,
      categoryLabel: meta.label,
      required: meta.category === 'statutory',
      condition: meta.condition || null,
      note: null
    };
    if (key === 'rectify' && reason) item.note = `须附：${reason.evidenceLabel}（${reason.proof}）；不得以情况说明替代。`;
    if (key === 'auth') item.note = '仅在委托他人办理时提供。';
    if (key === 'list') item.note = '按受理机关要求编制，不代替证明文件。';
    if (key === 'plan' && kase.type === 'penalty') item.note = '整改计划为辅助说明，不能替代整改证明。';
    return item;
  });
}

function requiredEvidence(kase, key) {
  if (kase.type !== 'abnormal') return [];
  const r = ABNORMAL_MAP[kase.abnormal_reason];
  if (!r) return [];
  return [{ kind: r.evidenceKind, label: r.evidenceLabel, note: r.proof }];
}

function options() {
  return {
    penaltyTypes: PENALTY_TYPES,
    keyFields: KEY_FIELDS,
    abnormalReasons: ABNORMAL_REASONS,
    dateBases: DATE_BASES,
    verificationScopes: VERIFICATION_SCOPES,
    verificationConclusions: VERIFICATION_CONCLUSIONS,
    materialCategories: Object.fromEntries(Object.entries(MATERIAL_META).map(([k, v]) => [k, v.label])),
    ruleEffective: RULE_EFFECTIVE
  };
}

module.exports = {
  RULE_EFFECTIVE, PENALTY_TYPES, PENALTY_MAP, THIRD_TYPES, SECOND_TYPES, MINOR_TYPES,
  KEY_FIELDS, ABNORMAL_REASONS, ABNORMAL_MAP, DATE_BASES, MATERIAL_META,
  VERIFICATION_SCOPES, VERIFICATION_CONCLUSIONS,
  seriousClass, classification, startInfo, materialPlan, requiredEvidence, options
};
