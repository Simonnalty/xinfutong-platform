'use strict';
/*
 * 诊断服务：分级判定 → 可申请日 → 材料清单 → 风险提示。
 * 结果落 diagnoses 表，便于回看「当时依据的是什么规则」。
 */
const db = require('../db.js');
const rules = require('./rules.js');
const { sha256,stable } = require('../crypto.js');

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

  const today = new Date().toISOString().slice(0, 10);
  const ev = await rules.evaluate(kase, today);

  const warnings = [];
  for (const b of ev.blockers) {
    warnings.push({ level: b.kind === 'unmet' || b.kind === 'level_conflict' ? 'bad' : b.kind === 'level_unknown' ? 'warn' : b.kind === 'unknown' ? 'warn' : 'warn', text: b.text });
  }
  // 轻微失信：公示期满由机关停止公示，不需要企业申请。
  // 这里必须把「无需申请」讲明白，否则等于让企业去做一件法律上不必做的事。
  if (ev.autoStopOnly) {
    warnings.push({ level: 'warn', text: `本情形属轻微失信：公示期满三个月由作出决定的机关停止公示，企业无需提交信用修复申请。${ev.applyFrom ? `按登记日期推算，预计停止公示日 ${ev.applyFrom}；` : ''}请在「信用中国」核对公示状态，若届满仍未停止，再向作出决定的机关反映。` });
  } else if (ev.eligible) {
    warnings.push({ level: 'info', text: `三项条件均已满足，${ev.applyFrom} 起可提交申请，规则配置办理参考时限 ${ev.reviewDays} 个工作日（以受理机关告知为准）。` });
  }
  if (kase.type === 'penalty') warnings.push({ level: 'info', text: '请按受理机关要求准备履行及整改证明，材料清单须结合具体事项核对。' });
  warnings.push({ level: 'info', text: '请通过官方渠道核实办理要求，警惕声称「内部渠道包过」的中介承诺。' });

  const result = {
    caseId,
    level: ev.level.code,
    levelLabel: ev.level.label,
    applyFrom: ev.applyFrom,
    eligible: ev.eligible,
    status: ev.status,
    blockers: ev.blockers,
    waitDays: ev.waitDays,
    conditions: ev.conditions,
    materials: ev.materials,
    levelCheck: ev.levelCheck || null,
    autoStopOnly: Boolean(ev.autoStopOnly),
    rejectReasons: ev.rejectReasons || [],
    basis: (ev.basis && ev.basis.length) ? ev.basis : (ev.ruleVersion?[{law:ev.ruleVersion.title,text:ev.ruleVersion.review_note,url:ev.ruleVersion.source_url}]:[]),
    ruleVersion:ev.ruleVersion,
    warnings,
    score: ev.score,
    reviewDays: ev.reviewDays,
    at: new Date().toISOString(),
    fingerprint: sha256([caseId, ev.level.code, ev.applyFrom || '', ev.score, today].join('|')).slice(0, 16)
  };

  await db.tx(async t=>{
    const d=await t.run('INSERT INTO diagnoses (case_id,level,apply_from,conditions,basis,score) VALUES (?,?,?,?,?,?)',[caseId,ev.level.code,ev.applyFrom,JSON.stringify(ev.conditions),JSON.stringify(result.basis),ev.score]);
    const content={facts:kase,rule:ev.ruleVersion,result};
    await t.run('INSERT INTO diagnosis_snapshots (diagnosis_id,case_id,content,digest) VALUES (?,?,?,?)',[d.insertId,caseId,JSON.stringify(content),sha256(stable(content))]);
    await t.run('UPDATE cases SET apply_from=? WHERE id=?',[ev.applyFrom,caseId]);
  });

  return result;
}

async function history(caseId) {
  return db.all('SELECT * FROM diagnoses WHERE case_id = ? ORDER BY id DESC LIMIT 10', [caseId]);
}

module.exports = { run, history, BASIS };
