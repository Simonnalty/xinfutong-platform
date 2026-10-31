'use strict';
/*
 * 幂等迁移：每次启动执行，只补该补的，不覆盖已有数据。
 * 与 seed.js 的区别：seed 只在空库时灌演示企业/案件；migrate 保证老库也拿到新增的授权关系。
 */
const { hashPassword } = require('../src/crypto.js');

module.exports = async function migrate({ all, one, run }) {
  // 0) 补列：老库没有事实字段时加上（MySQL 不支持 ADD COLUMN IF NOT EXISTS）
  const cols = await all(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases'`);
  const have = new Set(cols.map(r => r.c));
  const wanted = {
    obligation_at: 'DATE NULL',
    rectified: 'TINYINT NULL',
    rectify_at: 'DATE NULL',
    no_new_similar: 'TINYINT NULL',
    facts_updated_at: 'DATETIME NULL'
  };
  for (const [name, ddl] of Object.entries(wanted)) {
    if (!have.has(name)) await run(`ALTER TABLE cases ADD COLUMN ${name} ${ddl}`);
  }

  // 1) 机构授权关系：没有授权记录时，给演示机构授权 4 家企业。
  //    故意留 2 家不授权，用来验证「越权访问会被拒绝」。
  const [{ n: grants }] = await all('SELECT COUNT(*) AS n FROM org_enterprises');
  if (Number(grants) === 0) {
    const org = await one('SELECT id FROM orgs ORDER BY id LIMIT 1');
    if (org) {
      const ents = await all('SELECT id FROM enterprises ORDER BY id');
      for (const e of ents.slice(0, 4)) {
        await run('INSERT IGNORE INTO org_enterprises (org_id, enterprise_id, perm, note) VALUES (?,?,?,?)',
          [org.id, e.id, 'read', '演示授权']);
      }
    }
  }

  // 1.5) 演示事实：只补一次，不覆盖用户后来登记的
  const facts = [
    ['XF-2026-000437', null, 1, '2025-06-30', 1],
    ['XF-2026-000381', null, 1, '2025-11-20', 1],
    ['XF-2026-000352', null, 1, '2025-09-10', 0],
    ['XF-2026-000298', '2025-08-15', 1, '2025-08-10', 1],
    ['XF-2026-000240', '2025-05-20', 1, '2025-05-15', 1]
  ];
  for (const [id, obligationAt, rectified, rectifyAt, noNew] of facts) {
    const c = await one('SELECT id, facts_updated_at FROM cases WHERE id = ?', [id]);
    if (c && !c.facts_updated_at) {
      await run('UPDATE cases SET obligation_at = ?, rectified = ?, rectify_at = ?, no_new_similar = ?, facts_updated_at = NOW() WHERE id = ?',
        [obligationAt, rectified, rectifyAt, noNew, id]);
    }
  }

  // 2) 演示用的「只读成员」账号：能看，不能写
  const phone = '13907320003';
  let u = await one('SELECT id FROM users WHERE phone = ?', [phone]);
  if (!u) {
    const r = await run('INSERT INTO users (phone, pwd_hash, name, role) VALUES (?,?,?,?)',
      [phone, hashPassword('xft2026'), '陈小雨', 'enterprise']);
    u = { id: r.insertId };
  }
  const ent = await one('SELECT id FROM enterprises ORDER BY id LIMIT 1');
  if (ent) {
    const m = await one('SELECT 1 AS x FROM enterprise_members WHERE enterprise_id = ? AND user_id = ?', [ent.id, u.id]);
    if (!m) {
      await run("INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES (?,?, 'staff')", [ent.id, u.id]);
    }
  }
};
