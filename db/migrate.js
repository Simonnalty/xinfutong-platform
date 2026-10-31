'use strict';
/*
 * 幂等迁移：每次启动执行，只补该补的，不覆盖已有数据。
 * 与 seed.js 的区别：seed 只在空库时灌演示企业/案件；migrate 保证老库也拿到新增的授权关系。
 */
const { hashPassword } = require('../src/crypto.js');

module.exports = async function migrate({ all, one, run }) {
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
