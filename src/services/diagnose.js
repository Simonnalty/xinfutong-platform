'use strict';
/*
 * 诊断服务：分级判定 → 可申请日 → 材料清单 → 风险提示。
 * 结果落 diagnoses 表，便于回看「当时依据的是什么规则」。
 */
const db = require('../db.js');
const rules = require('./rules.js');
const { sha256 } = require('../crypto.js');

const BASIS = {
  abnormal: [
    { law: '《企业信息公示暂行条例》第十七条', text: '企业未按期公示年度报告的，由登记机关列入经营异常名录。' },
    { law: '《失信行为纠正后的信用信息修复管理办法（试行）》第十条', text: '失信主体纠正失信行为、履行相关义务后，可以申请信用修复。' },
    { law: '《市场监督管理信用修复管理办法》第六条', text: '被列入经营异常名录的企业，补报年报并公示后可申请移出。' }
  ],
  penalty: [
    { law: '《失信行为纠正后的信用信息修复管理办法（试行）》第十二条', text: '行政处罚信息公示期满一定期限，且失信行为已纠正的，可以申请修复。' },
    { law: '《市场监督管理信用修复管理办法》第八条', text: '行政处罚信息最短公示期届满且履行完毕的，可以申请信用修复。' },
    { law: '《中华人民共和国行政处罚法》第六条', text: '坚持处罚与教育相结合，引导当事人自觉守法。' }
  ]
};

async function run(caseId) {
  const kase = await db.one('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!kase) throw new Error('案件不存在');
  const ent = await db.one('SELECT * FROM enterprises WHERE id = ?', [kase.enterprise_id]);
  const today = new Date().toISOString().slice(0, 10);
  const ev = await rules.evaluate(kase, today);

  const warnings = [];
  if (!ev.eligible) warnings.push({ level: 'warn', text: `最短公示期未满，预计 ${ev.applyFrom} 后方可申请（还需 ${ev.waitDays} 天）。` });
  if (kase.type === 'penalty') warnings.push({ level: 'info', text: '行政处罚类修复需附缴款凭证与整改复查意见，缺一将被退回。' });
  if (!kase.removed_date && kase.type === 'abnormal') warnings.push({ level: 'bad', text: '尚未取得移出决定，需先完成补报并公示。' });
  warnings.push({ level: 'info', text: '信用修复不收取任何费用，任何声称「内部渠道包过」的均为诈骗。' });

  const result = {
    caseId,
    level: ev.level.code,
    levelLabel: ev.level.label,
    applyFrom: ev.applyFrom,
    eligible: ev.eligible,
    waitDays: ev.waitDays,
    conditions: ev.conditions,
    materials: ev.materials,
    basis: BASIS[kase.type] || BASIS.penalty,
    warnings,
    score: ev.score,
    reviewDays: ev.reviewDays,
    at: new Date().toISOString(),
    fingerprint: sha256([caseId, ev.level.code, ev.applyFrom || '', ev.score, today].join('|')).slice(0, 16)
  };

  await db.run(`INSERT INTO diagnoses (case_id, level, apply_from, conditions, basis, score) VALUES (?,?,?,?,?,?)`,
    [caseId, ev.level.code, ev.applyFrom, JSON.stringify(ev.conditions), JSON.stringify(result.basis), ev.score]);
  await db.run('UPDATE cases SET apply_from = ?, level = ? WHERE id = ?', [ev.applyFrom, ev.level.code, caseId]);

  return result;
}

async function history(caseId) {
  return db.all('SELECT * FROM diagnoses WHERE case_id = ? ORDER BY id DESC LIMIT 10', [caseId]);
}

module.exports = { run, history, BASIS };
