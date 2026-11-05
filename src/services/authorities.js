'use strict';
/*
 * 主管机关名录：案件只能挂在真实存在的机关下，禁止自由填写。
 *  - 人工核验的名录（authorities 表，verified=1）优先；
 *  - 名录里没有的，按「行政区划 + 机构命名规则」生成候选，用户选定后落库并标注来源；
 *  - 生成结果以行政区划（省/市/县区）为前提，不会出现凭空的机关。
 */
const db = () => require('../db');

// 机构名称：省级多用「厅/委」，市县多用「局」；第三项为特殊命名模板
// 结构：[通名, 省级名?, 模板?]  —— 省级名缺省时沿用通名
const TYPES = [
  ['市场监督管理局'],
  ['生态环境局', '生态环境厅'],
  ['交通运输局', '交通运输厅'],
  ['应急管理局', '应急管理厅'],
  ['卫生健康委员会'],
  ['住房和城乡建设局', '住房和城乡建设厅'],
  ['城市管理和综合执法局', '城市管理和综合执法局'],
  ['农业农村局', '农业农村厅'],
  ['人力资源和社会保障局', '人力资源和社会保障厅'],
  ['医疗保障局'],
  ['自然资源和规划局', '自然资源厅'],
  ['水利局', '水利厅'],
  ['林业局', '林业局'],
  ['商务局', '商务厅'],
  ['民政局', '民政厅'],
  ['财政局', '财政厅'],
  ['教育局', '教育厅'],
  ['公安局', '公安厅'],
  ['文化旅游广电体育局', '文化和旅游厅'],
  ['退役军人事务局', '退役军人事务厅'],
  ['统计局', '统计局'],
  ['审计局', '审计厅'],
  ['司法局', '司法厅'],
  ['生态环境局', '生态环境厅'],
  ['发展和改革委员会'],
  ['税务局', null, '国家税务总局%s税务局'],
  ['海关', null, '中华人民共和国%s海关'],
  ['消防救援支队', '消防救援总队'],
  ['烟草专卖局'],
  ['药品监督管理局', '药品监督管理局']
];

// 只输入地区（不带机构）时，给这批常用机关作为默认候选
const DEFAULTS = ['市场监督管理局', '生态环境局', '交通运输局', '应急管理局', '卫生健康委员会', '住房和城乡建设局'];

/** 按地区层级取机构名：level 1 = 省级，其余用市县通名 */
function typeName(entry, level) {
  const [local, prov, tpl] = entry;
  const base = (level === 1 && prov) ? prov : local;
  return { base: base.replace(/(局|厅|委员会)$/u, ''), tpl };
}

// 直辖市按市级命名（「北京市市场监督管理局」而不是「北京市市场监督管理厅」）
const MUNICIPAL = new Set(['北京市', '上海市', '天津市', '重庆市']);

function buildName(region, entry, level, parentName = '') {
  const [local, prov, tpl] = entry;
  if (tpl) {
    // 税务：区县级要带上级市名（国家税务总局济南市历下区税务局）
    if (tpl.indexOf('税务局') >= 0 && level === 3 && parentName) {
      return tpl.replace('%s', parentName + region);
    }
    // 税务：保留「市」字（国家税务总局济南市税务局）
    if (tpl.indexOf('税务局') >= 0) return tpl.replace('%s', region);
    // 海关：用简称（大连海关、义乌海关，去掉「市」）
    return tpl.replace('%s', region.replace(/市$/u, ''));
  }
  // 省级用省级通名（厅/委），市县用地方通名（局/委）
  const effLevel = MUNICIPAL.has(region) ? 2 : level;
  return region + ((effLevel === 1 && prov) ? prov : local);
}

// 常用简称 → 机构全称（用户很少会完整输入「市场监督管理局」）
const ALIASES = {
  '市场监管': '市场监督管理局', '工商': '市场监督管理局', '食药': '市场监督管理局',
  '城管': '城市管理和综合执法局', '综合执法': '城市管理和综合执法局', '城市管理': '城市管理和综合执法局',
  '人社': '人力资源和社会保障局', '劳动': '人力资源和社会保障局',
  '卫健': '卫生健康委员会', '卫健委': '卫生健康委员会', '卫生': '卫生健康委员会',
  '文旅': '文化旅游广电体育局', '旅游': '文化旅游广电体育局', '文化': '文化旅游广电体育局',
  '医保': '医疗保障局', '生态环境': '生态环境局', '环保': '生态环境局',
  '应急': '应急管理局', '安监': '应急管理局', '交通': '交通运输局', '住建': '住房和城乡建设局',
  '建设': '住房和城乡建设局', '农业': '农业农村局', '水利': '水利局', '林业': '林业局',
  '商务': '商务局', '民政': '民政局', '财政': '财政局', '教育': '教育局', '公安': '公安局',
  '发改': '发展和改革委员会', '发改局': '发展和改革委员会', '退役': '退役军人事务局',
  '统计': '统计局', '审计': '审计局', '司法': '司法局', '税务': '税务局', '海关': '海关',
  '消防': '消防救援支队', '烟草': '烟草专卖局', '药监': '药品监督管理局'
};

/** 按关键词搜索：人工名录 + 生成候选 */
async function list({ keyword = '' } = {}) {
  const k = String(keyword || '').trim();
  const curated = await db().all(
    `SELECT id,name,region,level,credit_code,'curated' AS source FROM authorities
      WHERE verified=1 AND (?='' OR name LIKE ?) ORDER BY id LIMIT 50`, [k, `%${k}%`]);
  if (!k) return curated;


  // 机构类型识别：允许用户只输入前半段（「市场监督管理」而非全称「市场监督管理局」）
  const stemOf = t => t.replace(/(局|厅|委员会|委|支队|总队)$/u, '');
  const stems = TYPES.filter(e => {
    const [local, prov] = e;
    return k.includes(local) || (prov && k.includes(prov)) || k.includes(stemOf(local));
  });
  // 简称命中时补上对应机构（「市场监管」「人社」这类）
  for (const [alias, full] of Object.entries(ALIASES)) {
    if (!k.includes(alias)) continue;
    const entry = TYPES.find(e => e[0] === full || e[1] === full);
    if (entry && !stems.includes(entry)) stems.push(entry);
  }

  // 有空格时以第一段作为地区词（「株洲 市场监管」），否则从全称里剥掉机构名
  const hasSpace = /[\s,，、/]/.test(k);
  let regionKw = hasSpace ? k.split(/[\s,，、/]+/)[0] : k.replace(/[\s,，、/]+/gu, '');
  if (!hasSpace) {
    for (const [local, prov] of stems) {
      regionKw = regionKw.replace(local, '').replace(prov || '', '').replace(stemOf(local), '');
    }
    for (const alias of Object.keys(ALIASES)) regionKw = regionKw.replace(alias, '');
  }

  const items = [...curated];
  const seen = new Set(items.map(i => i.name));


  // 预生成的全国候选（verified=0）：按地区词查库，再按机构词过滤，省掉实时拼装
  if (regionKw.length >= 2) {
    const pool = await db().all(
      `SELECT id,name,region,level,credit_code,'generated' AS source FROM authorities
        WHERE verified=0 AND name LIKE ? ORDER BY (name=?) DESC, id LIMIT 200`, [`%${regionKw}%`, k]);
    const want = stems.length ? stems : DEFAULTS.map(t => TYPES.find(e => e[0] === t)).filter(Boolean);
    for (const g of pool) {
      if (seen.has(g.name)) continue;
      if (!want.some(([local, , tpl]) => g.name.includes(local) || (tpl && /税务局/.test(tpl) && /税务局/.test(g.name)))) continue;
      seen.add(g.name);
      items.push(g);
      if (items.length >= 60) break;
    }
  }

  // 关键词被「地区 + 机构」拆开时，人工名录用地区词再匹配一次（避免把已核验机关标成待核验）
  if (stems.length && regionKw.length >= 2) {
    const more = await db().all(
      `SELECT id,name,region,level,credit_code,'curated' AS source FROM authorities
        WHERE verified=1 AND name LIKE ? ORDER BY id LIMIT 50`, [`%${regionKw}%`]);
    for (const m of more) {
      if (seen.has(m.name)) continue;
      if (!stems.some(([local]) => m.name.includes(local.replace(/(局|厅|委员会|委)$/u, '')))) continue;
      seen.add(m.name);
      items.push(m);
    }
  }

  const useTypes = stems.length ? stems : DEFAULTS.map(t => TYPES.find(e => e[0] === t)).filter(Boolean);
  if (useTypes.length) {
    const regions = await db().all(
      `SELECT r.code,r.name,r.level,p.name AS parent_name FROM regions r
        LEFT JOIN regions p ON r.parent=p.code
        WHERE ?<>'' AND r.level<=3
          AND (r.name LIKE CONCAT(?, '%') OR ? LIKE CONCAT('%', r.name, '%'))
          AND r.name NOT LIKE '%镇' AND r.name NOT LIKE '%乡' AND r.name NOT LIKE '%街道'
        ORDER BY (r.name = ?) DESC, r.level ASC LIMIT 12`,
      [regionKw, regionKw, regionKw, regionKw]);
    for (const r of regions) {
      for (const entry of useTypes) {
        // 海关按口岸设置，只有省/市级可能有直属海关，区县不生成
        if (entry[0] === '海关' && r.level === 3 && !/市$/u.test(r.name)) continue;
        const name = buildName(r.name, entry, r.level, r.parent_name);
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
      `INSERT IGNORE INTO authorities (name,region,level,credit_code,verified,note) VALUES (?,?,?,'',0,?)`,
      [derived.name, derived.region, derived.level, '按行政区划与机构命名规则生成，待人工核验']);
    return db().one('SELECT * FROM authorities WHERE name=?', [derived.name]);
  }

  const near = await db().all('SELECT name FROM authorities WHERE verified=1 AND name LIKE ? LIMIT 5', [`%${n.slice(-6)}%`]);
  const hint = near.length ? `；你可能想选：${near.map(r => r.name).join('、')}` : '';
  throw new Error(`「${n}」不在已核验的主管机关名录中，也无法按行政区划生成，请从名录中选择${hint}`);
}

/** 运营核验：把待核验候选确认为已核验（人工比对官方门户后调用） */
async function verify(id, operator) {
  const row = await db().one('SELECT * FROM authorities WHERE id=?', [id]);
  if (!row) throw new Error('机关不存在');
  await db().run(
    'UPDATE authorities SET verified=1, note=?, credit_code=? WHERE id=?',
    [`${row.note || ''}；由 ${operator || '运营'} 于 ${new Date().toISOString().slice(0, 10)} 核验`, row.credit_code || '', id]);
  return db().one('SELECT * FROM authorities WHERE id=?', [id]);
}

/** 待核验候选（运营端工作台用） */
async function pending(limit = 100) {
  return db().all('SELECT id,name,region,level,note,created_at FROM authorities WHERE verified=0 ORDER BY id DESC LIMIT ?', [limit]);
}

/** 尝试把「地区名 + 机构名」还原成真实机关 */
async function derive(n) {
  for (const entry of TYPES) {
    const [local, , tpl] = entry;
    const t = local;
    const regionName = tpl
      ? (n.startsWith(tpl.split('%s')[0]) && n.endsWith(tpl.split('%s')[1] || '')
          ? n.slice(tpl.split('%s')[0].length, n.length - (tpl.split('%s')[1] || '').length)
          : null)
      : (n.endsWith(t) ? n.slice(0, -t.length) : (entry[1] && n.endsWith(entry[1]) ? n.slice(0, -entry[1].length) : null));
    if (!regionName) continue;
    const r = await db().one('SELECT name,level FROM regions WHERE name=? LIMIT 1', [regionName]);
    if (!r) continue;
    return { name: n, region: r.name, level: r.level === 3 ? 'county' : 'city' };
  }
  return null;
}

module.exports = { list, lookup, verify, pending, TYPES, buildName };
