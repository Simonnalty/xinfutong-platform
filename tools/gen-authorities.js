'use strict';
/*
 * 预生成全国主管机关候选并写入 authorities 表（verified=0，待人工核验）。
 * 用法：node tools/gen-authorities.js [--batch=2000]
 * 规则来源与 api 里「按行政区划生成」完全一致，避免两套命名。
 */
const db = require('../src/db.js');
const { TYPES, buildName } = require('../src/services/authorities.js');

const batch = Number((process.argv.find(a => a.startsWith('--batch=')) || '--batch=2000').split('=')[1]);

(async () => {
  await db.ready();
  const regions = await db.all('SELECT r.code,r.name,r.level,p.name AS parent_name FROM regions r LEFT JOIN regions p ON r.parent=p.code WHERE r.level<=3');
  console.log('区划', regions.length);

  const rows = [];
  const seen = new Set();
  for (const r of regions) {
    for (const entry of TYPES) {
      if (entry[0] === '海关' && r.level === 3 && !/市$/u.test(r.name)) continue; // 区县一般无常设海关
      const name = buildName(r.name, entry, r.level, r.parent_name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      rows.push([name, r.name, r.level === 1 ? 'province' : r.level === 2 ? 'city' : 'county']);
    }
  }
  console.log('待写入', rows.length);

  let done = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const placeholders = chunk.map(() => "(?,?,?,'',0,'按行政区划与机构命名规则生成，待人工核验')").join(',');
    await db.run(`INSERT IGNORE INTO authorities (name,region,level,credit_code,verified,note) VALUES ${placeholders}`, chunk.flat());
    done += chunk.length;
    if (done % 20000 === 0) console.log('已写入', done);
  }
  const [{ n }] = await db.all('SELECT COUNT(*) AS n FROM authorities');
  console.log('完成，authorities 共', n, '条');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
