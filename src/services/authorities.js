'use strict';
/*
 * 主管机关名录：案件只能挂在真实存在的机关下，禁止自由填写。
 *  - 人工核验的名录（authorities 表，verified=1）优先；
 *  - 名录里没有的，按「行政区划 + 机构命名规则」生成候选，用户选定后落库并标注来源；
 *  - 生成结果以行政区划（省/市/县区）为前提，不会出现凭空的机关。
 */
const db = () => require('../db');

// 2018 机构改革后的通用机构名称；第三项为特殊命名模板（国家税务总局X税务局 / 中华人民共和国X海关）
const TYPES = [
  ['市场监督管理局'], ['生态环境局'], ['交通运输局'], ['应急管理局'],
  ['卫生健康委员会'], ['住房和城乡建设局'], ['城市管理和综合执法局'],
  ['农业农村局'], ['人力资源和社会保障局'], ['医疗保障局'],
  ['自然资源和规划局'], ['水利局'], ['林业局'], ['商务局'], ['民政局'],
  ['财政局'], ['教育局'], ['公安局'], ['文化旅游广电体育局'],
  ['税务局', '国家税务总局%s税务局'], ['海关', '中华人民共和国%s海关']
];

function buildName(region, type, tpl) {
  if (tpl) return tpl.replace('%s', region);
  return region + type;
}

/** 按关键词搜索：人工名录 + 生成候选 */
async function list({ keyword = '' } = {}) {
  const k = String(keyword || '').trim();
  const curated = await db().all(
    `SELECT id,name,region,level,credit_code,'curated' AS source FROM authorities
      WHERE verified=1 AND (?='' OR name LIKE ?) ORDER BY id LIMIT 50`, [k, `%${k}%`]);
  if (!k) return curated;

  // 机构类型识别：允许用户只输入前半段（「市场监督管理」而非全称「市场监督管理局」）
  const stems = TYPES.filter(([t]) => {
    const stem = t.replace(/(局|厅|委员会|委)$/u, '');
    return k.includes(t) || k.includes(stem);
  });

  let regionKw = k.replace(/[\s,，、/]+/gu, '');
  for (const [t] of stems) regionKw = regionKw.replace(t, '').replace(t.replace(/(局|厅|委员会|委)$/u, ''), '');

  const items = [...curated];
  const seen = new Set(items.map(i => i.name));

  // 关键词被「地区 + 机构」拆开时，人工名录用地区词再匹配一次（避免把已核验机关标成待核验）
  if (stems.length && regionKw.length >= 2) {
    const more = await db().all(
      `SELECT id,name,region,level,credit_code,'curated' AS source FROM authorities
        WHERE verified=1 AND name LIKE ? ORDER BY id LIMIT 50`, [`%${regionKw}%`]);
    for (const m of more) {
      if (seen.has(m.name)) continue;
      if (!stems.some(([t]) => m.name.includes(t.replace(/(局|厅|委员会|委)$/u, '')))) continue;
      seen.add(m.name);
      items.push(m);
    }
  }

  if (stems.length) {
    const regions = await db().all(
      `SELECT code,name,level FROM regions
        WHERE (?<>'' AND name LIKE ?) ORDER BY level DESC LIMIT 12`,
      [regionKw, `%${regionKw}%`]);
    for (const r of regions) {
      for (const [t, tpl] of stems) {
        const name = buildName(r.name, t, tpl);
        if (seen.has(name)) continue;
        seen.add(name);
        items.push({ name, region: r.name, level: r.level === 3 ? 'county' : 'city', credit_code: '', source: 'derived' });
      }
    }
  }
  return items.slice(0, 60);
}

/** 校验并返回机关；名录没有但可由行政区划生成时落库 */
async function lookup(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('请选择主管机关');
  const row = await db().one('SELECT * FROM authorities WHERE name=? AND verified=1', [n]);
  if (row) return row;

  const derived = await derive(n);
  if (derived) {
    await db().run(
      `INSERT IGNORE INTO authorities (name,region,level,credit_code,verified,note) VALUES (?,?,?,'',1,?)`,
      [derived.name, derived.region, derived.level, '按行政区划与机构命名规则生成，待人工核验']);
    return db().one('SELECT * FROM authorities WHERE name=?', [derived.name]);
  }

  const near = await db().all('SELECT name FROM authorities WHERE verified=1 AND name LIKE ? LIMIT 5', [`%${n.slice(-6)}%`]);
  const hint = near.length ? `；你可能想选：${near.map(r => r.name).join('、')}` : '';
  throw new Error(`「${n}」不在已核验的主管机关名录中，也无法按行政区划生成，请从名录中选择${hint}`);
}

/** 尝试把「地区名 + 机构名」还原成真实机关 */
async function derive(n) {
  for (const [t, tpl] of TYPES) {
    const full = tpl ? tpl.replace('%s', '\u0001') : null;
    const regionName = tpl
      ? (n.startsWith(tpl.split('%s')[0]) && n.endsWith(tpl.split('%s')[1] || '')
          ? n.slice(tpl.split('%s')[0].length, n.length - (tpl.split('%s')[1] || '').length)
          : null)
      : (n.endsWith(t) ? n.slice(0, -t.length) : null);
    if (!regionName) continue;
    const r = await db().one('SELECT name,level FROM regions WHERE name=? LIMIT 1', [regionName]);
    if (!r) continue;
    return { name: n, region: r.name, level: r.level === 3 ? 'county' : 'city' };
  }
  return null;
}

module.exports = { list, lookup };
