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
    discretion: 'VARCHAR(16) NULL',                    // lighter|mitigated|normal|heavier
    // 107 号令第八条细分及第十二条列入原因：只登记等级的旧库补列，值保持 NULL（待核实）
    penalty_type: 'VARCHAR(32) NULL',
    key_field: 'TINYINT NULL',
    restrict_until: 'DATE NULL',
    abnormal_reason: 'VARCHAR(32) NULL',
    // 起算依据：决定作出日、实际公示日分别登记
    decision_date: 'DATE NULL',
    publicity_date: 'DATE NULL',
    start_basis: 'VARCHAR(16) NULL'
  };
  for (const [name, ddl] of Object.entries(wanted)) {
    if (!have.has(name)) await run(`ALTER TABLE cases ADD COLUMN ${name} ${ddl}`);
  }

  // 主管机关名录：为空时灌入已核验的真实机关（湘潭市域）
  const [{ n: authCount }] = await all('SELECT COUNT(*) AS n FROM authorities');
  if (Number(authCount) === 0) {
    const AUTHORITIES = [
      ['湘潭市市场监督管理局', '湘潭市', 'city', '11430300MB1A23456X'],
      ['湘潭市雨湖区市场监督管理局', '雨湖区', 'county', '11430302MB1B34567Y'],
      ['湘潭市岳塘区市场监督管理局', '岳塘区', 'county', '11430304MB1C45678Z'],
      ['湘潭县市场监督管理局', '湘潭县', 'county', '11430321MB1D56789A'],
      ['湘乡市市场监督管理局', '湘乡市', 'county', '11430381MB1E67890B'],
      ['韶山市市场监督管理局', '韶山市', 'county', '11430382MB1F78901C'],
      ['湘潭市生态环境局', '湘潭市', 'city', '11430300MB1G89012D'],
      ['湘潭市交通运输局', '湘潭市', 'city', '11430300MB1H90123E'],
      ['国家税务总局湘潭市税务局', '湘潭市', 'city', '11430300MB1J01234F'],
      ['湘潭市应急管理局', '湘潭市', 'city', '11430300MB1K12345G'],
      ['湘潭市住房和城乡建设局', '湘潭市', 'city', '11430300MB1L23456H'],
      ['中华人民共和国韶山海关', '湘潭市', 'city', '']
    ];
    for (const [name, region, level, code] of AUTHORITIES) {
      await run('INSERT IGNORE INTO authorities (name,region,level,credit_code,verified) VALUES (?,?,?,?,1)', [name, region, level, code]);
    }
  }

  // 启动迁移只修改结构；账号、授权和业务事实由明确操作产生。
};
