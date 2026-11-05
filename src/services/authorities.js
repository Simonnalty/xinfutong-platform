'use strict';
/*
 * 主管机关名录：案件只能挂在已核验的真实机关下，禁止自由填写。
 * 名录由平台运营维护（/api/admin/authorities），企业端只能选择。
 */
// 延迟 require：db.js 初始化期间可能间接引用本模块，顶层 require 会拿到未完成的导出
const db = () => require('../db');

async function list({ keyword = '' } = {}) {
  const k = String(keyword || '').trim();
  return db().all(
    `SELECT id,name,region,level,credit_code FROM authorities
      WHERE verified=1 AND (?='' OR name LIKE ?) ORDER BY level DESC, id`,
    [k, `%${k}%`]);
}

/** 校验并返回机关；不在名录里直接拒绝，并提示可选项。
 *  注意：不能命名为 require，会遮蔽 CommonJS 的 require 造成递归 */
async function lookup(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('请选择主管机关');
  const row = await db().one('SELECT * FROM authorities WHERE name=? AND verified=1', [n]);
  if (row) return row;
  const near = await db().all('SELECT name FROM authorities WHERE verified=1 AND name LIKE ? LIMIT 5', [`%${n.slice(-6)}%`]);
  const hint = near.length ? `；你可能想选：${near.map(r => r.name).join('、')}` : '';
  throw new Error(`「${n}」不在已核验的主管机关名录中，请从名录中选择${hint}。确需新增请联系平台运营核验主体资格`);
}

module.exports = { list, lookup };
