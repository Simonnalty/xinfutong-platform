'use strict';
/*
 * 幂等迁移：每次启动执行，只补该补的，不覆盖已有数据。
 * 只补数据库结构；不创建账号、授权或业务事实。
 */

module.exports = async function migrate({ all, one, run }) {
  const lease=await one("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='scheduled_jobs' AND COLUMN_NAME='lease_token'");
  if(!lease)await run('ALTER TABLE scheduled_jobs ADD COLUMN lease_token CHAR(36) NULL');
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
    facts_updated_at: 'DATETIME NULL',
    // 107 号令第七条：较低数额罚款 = 「从轻/减轻的裁量阶次」+「经营主体 5 万元以下」
    // 两个条件同时成立。只登记金额会把 3 万元的一般阶次罚款误判成轻微。
    fine_amount: 'DECIMAL(12,2) NULL',
    discretion: 'VARCHAR(16) NULL'                     // lighter|mitigated|normal|heavier
  };
  for (const [name, ddl] of Object.entries(wanted)) {
    if (!have.has(name)) await run(`ALTER TABLE cases ADD COLUMN ${name} ${ddl}`);
  }

  // 启动迁移只修改结构；账号、授权和业务事实由明确操作产生。
};
