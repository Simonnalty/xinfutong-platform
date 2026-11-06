'use strict';
const legal = require('./legal.js');
function text(value, label, max, required = false) {
  if (value != null && typeof value !== 'string') throw new Error(`${label}格式不正确`);
  const v = String(value ?? '').trim();
  if (required && !v) throw new Error(`请填写${label}`);
  if (v.length > max) throw new Error(`${label}最多 ${max} 个字符`);
  return v;
}
function date(value, label, required = false) {
  if (value == null || value === '') {
    if (required) throw new Error(`请填写${label}`);
    return null;
  }
  const v = text(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '2100-12-31' || new Date(v+'T00:00:00Z').toISOString().slice(0,10) !== v) throw new Error(`${label}不是有效日期`);
  return v;
}
function tri(value, label) {
  if (value === null || value === '') return null;
  if ([0,1,'0','1',false,true].includes(value)) return Number(value);
  throw new Error(`${label}必须为是、否或未知`);
}
// 罚款金额：决定书载明的数额，单位元。留空表示尚未登记，不等于 0。
function money(value, label) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error(`${label}不是有效金额`);
  return Math.round(n * 100) / 100;
}
// 裁量阶次：对应 107 号令第七条的「从轻或者减轻处罚的裁量阶次」。
// 法规只认「从轻」「减轻」两种，其余阶次即使金额低于 5 万元也不构成轻微失信。
const DISCRETIONS = ['lighter', 'mitigated', 'normal', 'heavier'];
function discretion(value, label) {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (!DISCRETIONS.includes(v)) throw new Error(`${label}取值不正确`);
  return v;
}
// 结构化分类字段：必须取自法条口径字典，不能自由填写。
function oneOf(value, label, allowed) {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (!allowed.includes(v)) throw new Error(`${label}取值不正确，请从清单中选择`);
  return v;
}
function facts(input, previous = {}) {
  const out = {};
  for (const [key,label] of Object.entries({ obligation_at:'义务履行日期',rectify_at:'整改日期',removed_date:'移出日期',restrict_until:'限制期限届满日',decision_date:'处罚决定日期',publicity_date:'实际公示日期' })) out[key] = Object.hasOwn(input,key) ? date(input[key],label) : previous[key] ?? null;
  for (const [key,label] of Object.entries({rectified:'整改状态',no_new_similar:'新增同类失信状态',key_field:'是否重点领域'})) out[key] = Object.hasOwn(input,key) ? tri(input[key],label) : previous[key] ?? null;
  out.fine_amount = Object.hasOwn(input,'fine_amount')
    ? money(input.fine_amount, '罚款金额')
    : (previous.fine_amount == null ? null : money(previous.fine_amount, '罚款金额'));
  out.discretion = Object.hasOwn(input,'discretion')
    ? discretion(input.discretion, '裁量阶次')
    : (previous.discretion ?? null);
  out.penalty_type = Object.hasOwn(input,'penalty_type')
    ? oneOf(input.penalty_type, '处罚种类', Object.keys(legal.PENALTY_MAP))
    : (previous.penalty_type ?? null);
  out.abnormal_reason = Object.hasOwn(input,'abnormal_reason')
    ? oneOf(input.abnormal_reason, '经营异常列入原因', Object.keys(legal.ABNORMAL_MAP))
    : (previous.abnormal_reason ?? null);
  out.start_basis = Object.hasOwn(input,'start_basis')
    ? oneOf(input.start_basis, '最短公示期起算依据', legal.DATE_BASES.map(b => b.code))
    : (previous.start_basis ?? null);
  if (out.rectified === 0 && out.rectify_at) throw new Error('未完成整改时不能登记整改完成日期');
  if (out.decision_date && out.publicity_date && out.publicity_date < out.decision_date) throw new Error('实际公示日期不能早于处罚决定日期');
  const basis = legal.DATE_BASES.find(b => b.code === out.start_basis);
  const basisDate = basis ? (out[basis.field] ?? (basis.field === 'listed_date' ? previous.listed_date : null)) : null;
  if (basis && !basisDate) throw new Error(`选择「${basis.label}」作为起算依据时，请先填写该日期`);
  return out;
}
function forbidden(message) { return Object.assign(new Error(message),{code:'FORBIDDEN'}); }
module.exports = {text,date,tri,money,discretion,oneOf,DISCRETIONS,facts,forbidden};
