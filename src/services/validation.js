'use strict';
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
function facts(input, previous = {}) {
  const out = {};
  for (const [key,label] of Object.entries({ obligation_at:'义务履行日期',rectify_at:'整改日期',removed_date:'移出日期' })) out[key] = Object.hasOwn(input,key) ? date(input[key],label) : previous[key] ?? null;
  for (const [key,label] of Object.entries({rectified:'整改状态',no_new_similar:'新增同类失信状态'})) out[key] = Object.hasOwn(input,key) ? tri(input[key],label) : previous[key] ?? null;
  out.fine_amount = Object.hasOwn(input,'fine_amount')
    ? money(input.fine_amount, '罚款金额')
    : (previous.fine_amount == null ? null : money(previous.fine_amount, '罚款金额'));
  out.discretion = Object.hasOwn(input,'discretion')
    ? discretion(input.discretion, '裁量阶次')
    : (previous.discretion ?? null);
  if (out.rectified === 0 && out.rectify_at) throw new Error('未完成整改时不能登记整改完成日期');
  return out;
}
function forbidden(message) { return Object.assign(new Error(message),{code:'FORBIDDEN'}); }
module.exports = {text,date,tri,money,discretion,DISCRETIONS,facts,forbidden};
