'use strict';
/*
 * 种子数据。只在 enterprises 为空时执行一次。
 * 所有数据均为演示数据，企业名称、文号除公开法规外均为虚构。
 */
const { hashPassword } = require('../src/crypto.js');

const PWD = 'xft2026';

const ENTERPRISES = [
  ['湖南恒基建材有限公司', '91430300MA4L8XK23F', '周立恒', '建材制造', '湘潭市雨湖区', '中型', '周立恒', '13907320001'],
  ['湘潭远达机械制造有限公司', '91430300MA4L2QW81B', '陈国栋', '通用设备制造', '湘潭市岳塘区', '中型', '陈国栋', '13907320002'],
  ['湖南顺达物流有限公司', '91430300MA4L6TY35D', '刘海涛', '道路运输', '湘潭市雨湖区', '小型', '刘海涛', '13907320003'],
  ['湖南湘水食品有限公司', '91430300MA4L9ZP47H', '黄志强', '食品加工', '湘潭市湘潭县', '小型', '黄志强', '13907320004'],
  ['湘潭味美餐饮管理有限公司', '91430300MA4L3NM60J', '谭美玲', '餐饮服务', '湘潭市岳塘区', '微型', '谭美玲', '13907320005'],
  ['湘潭金海新材料有限公司', '91430300MA4L7VC92E', '罗建平', '新材料', '湘潭市高新区', '中型', '罗建平', '13907320006'],
  ['湘潭新程智能设备有限公司（演示）', '91430300MA4L8XT001', '陈新程（演示）', '智能设备制造', '湖南省湘潭市岳塘区', '小型', '陈新程（演示）', '']
];

const CASES = [
  ['XF-2026-000437', 1, 'abnormal', '未按规定期限公示 2024 年度报告', '湘潭市市场监督管理局', '潭市监信列〔2025〕0317 号', '2025-03-18', '2025-07-02', 'minor', 'reviewing', 62, '2025-10-02', '2026-11-12', null, null],
  ['XF-2026-000381', 2, 'penalty', '特种设备超期未检（起重机械）', '湘潭市市场监督管理局', '潭市监处罚〔2026〕0214 号', '2026-02-11', null, 'serious', 'draft', 30, '2027-02-11', '2027-05-11', 80000.00, 'normal'],
  ['XF-2026-000352', 3, 'abnormal', '未按期报送 2024 年度报告', '湘潭市市场监督管理局', '潭市监信列〔2025〕0188 号', '2025-05-09', null, 'general', 'draft', 15, '2025-11-15', '2026-12-20', null, null],
  // 演示「只按金额判等级会判错」：3 万元低于 5 万，但裁量阶次是一般，
  // 依 107 号令第七条不构成轻微失信，应按一般失信等满三个月再申请。
  ['XF-2026-000298', 4, 'penalty', '生产经营标注虚假生产日期的食品', '湘潭市市场监督管理局', '潭市监处罚〔2025〕0533 号', '2025-08-20', null, 'general', 'reviewing', 48, '2026-02-20', '2026-11-18', 30000.00, 'normal'],
  ['XF-2026-000240', 5, 'abnormal', '未按期报送 2023 年度报告', '湘潭市雨湖区市场监督管理局', '雨市监信列〔2024〕0091 号', '2024-04-12', '2024-08-01', 'minor', 'repaired', 100, '2024-10-01', '2025-01-01', null, null],
  // 演示「轻微失信无需申请」：仅处罚款 2 万元、从轻阶次，两项要件同时成立，
  // 依 107 号令第七条公示期满三个月由机关停止公示，企业不需要提交申请。
  ['XF-2026-000455', 1, 'penalty', '未按规定明码标价（建材价签与实际不符）', '湘潭市雨湖区市场监督管理局', '雨市监处罚〔2026〕0088 号', '2026-08-15', null, 'minor', 'draft', 20, '2026-11-15', '2026-12-15', 20000.00, 'lighter'],
  ['XF-DEMO-20261102-01', 7, 'penalty', '特种设备未按期检验（虚构演示事项）', '演示市场监督管理局', '演示设备罚〔2026〕001号', '2026-08-10', null, 'general', 'draft', 0, null, '2026-11-20', 80000.00, 'normal']
];

const CHANNELS = [
  ['XF-2026-000437', 'credit_china', '信用中国', 'ok', '已停止公示', '2026-10-26 10:00:00', 1],
  ['XF-2026-000437', 'gsxt', '国家企业信用信息公示系统', 'ok', '已移出经营异常名录', '2026-10-26 10:00:00', 2],
  ['XF-2026-000437', 'qcc', '企查查', 'bad', '仍显示「经营异常」', '2026-10-28 09:12:00', 3],
  ['XF-2026-000437', 'tianyancha', '天眼查', 'warn', '处罚已撤销，名录未更新', '2026-10-28 09:12:00', 4],
  ['XF-2026-000437', 'bank', '银行信贷风控名单', 'idle', '待合作银行核验', null, 5]
];

const TIMELINE = [
  ['XF-2026-000437', '2026-10-20 14:22:00', '系统', '修复材料生成完成', '5 份文书 · 预审 92 分'],
  ['XF-2026-000437', '2026-10-21 09:40:00', '周立恒', '线上提交申请', '国家企业信用信息公示系统（湖南）'],
  ['XF-2026-000437', '2026-10-23 10:05:00', '湘潭市市场监督管理局', '受理', '信用监管科'],
  ['XF-2026-000437', '2026-10-28 09:00:00', '湘潭市市场监督管理局', '实质审核中', '已核验整改材料，等待作出决定'],
  ['XF-2026-000437', '2026-11-12 18:00:00', '湘潭市市场监督管理局', '作出修复决定', '承诺时限 15 个工作日（预计）'],
  ['XF-DEMO-20261102-01', '2026-11-02 10:00:00', '企业演示账号', '建立修复事项', '特种设备未按期检验（虚构演示事项），尚未提交官方申请']
];

const TASKS = [
  ['XF-2026-000437', '补报并公示年度报告', '周立恒', '2025-06-30', 'done'],
  ['XF-2026-000437', '取得移出经营异常名录决定书', '周立恒', '2025-07-05', 'done'],
  ['XF-2026-000437', '生成并核对修复材料', '系统', '2026-10-20', 'done'],
  ['XF-2026-000437', '向属地市场监管局提交申请', '周立恒', '2026-10-21', 'done'],
  ['XF-2026-000437', '跟进审核进度、补正材料', '周立恒', '2026-11-12', 'doing'],
  ['XF-2026-000437', '修复后核验各平台同步情况', '系统', '2026-11-20', 'todo'],
  ['XF-DEMO-20261102-01', '补全履行与整改事实', '企业演示账号', '2026-11-20', 'todo'],
  ['XF-DEMO-20261102-01', '整理证明附件', '企业演示账号', '2026-11-20', 'todo'],
  ['XF-DEMO-20261102-01', '诊断并核对申请材料', '企业演示账号', '2026-11-20', 'todo'],
  ['XF-DEMO-20261102-01', '登记办理回执与官方结果', '企业演示账号', '2026-11-20', 'todo']
];

const POLICIES = [
  ['《失信行为纠正后的信用信息修复管理办法（试行）》', '国家发展改革委', '2023-01-20', '2023-05-01', 'department', '明确信用修复的条件、程序、时限，是信用修复的基本依据。', 'https://www.gov.cn/zhengce/zhengceku/2023-01/20/content_5738363.htm', '信用修复,部门规章'],
  ['《企业信息公示暂行条例》', '国务院', '2014-08-23', '2014-10-01', 'regulation', '规定企业年度报告公示义务及经营异常名录、严重违法失信名单制度。', 'https://www.gov.cn/zhengce/2014-08/23/content_2739191.htm', '信息公示,行政法规'],
  ['《市场监督管理信用修复管理办法》', '国家市场监督管理总局', '2021-07-30', '2021-09-01', 'department', '市场监管领域行政处罚信息、经营异常名录的修复条件与办理流程。', 'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/xyjgs/art/2023/art_9a0b9c1c8d1e4b0e8f8e5c1a0e6d0c1f.html', '市场监管,信用修复']
];

const KB = [
  ['basics', '什么是信用修复？和「删除记录」有什么区别？',
   '信用修复是指失信主体在纠正失信行为、履行相关义务后，依照法定程序申请停止公示、解除惩戒措施的制度。它不是删除记录：原始失信信息仍会留存于行政系统内部，修复的是「对外公示」和「惩戒措施」，且修复后再次失信会被从重处理。'],
  ['process', '经营异常名录怎么移出？需要哪些材料？',
   '移出经营异常名录分两种情形：一是补报年度报告并公示后申请移出；二是更正公示信息后申请移出。通常需要提交移出申请书、守信承诺书、整改说明及证明材料。各地受理口径略有差异，以属地市场监管部门要求为准。'],
  ['risk', '修复完成后，第三方平台还显示怎么办？',
   '信用中国、国家企业信用信息公示系统完成修复后，第三方商业平台（企查查、天眼查等）通常需要 3–15 个工作日同步，也可能因抓取滞后长期不更新。此时可向平台发送《数据异议与更正函》，要求其依照《个人信息保护法》《数据安全法》及平台自身规则核验更正；拒不处理的，可向网信部门或市场监管部门投诉。']
];

const RULES = [
  ['min_months.minor', '3', '轻微失信最短公示期（月）'],
  ['min_months.general', '6', '一般失信最短公示期（月）'],
  ['min_months.serious', '12', '严重失信最短公示期（月）'],
  ['review_days', '15', '行政机关受理后作出决定的承诺时限（工作日）'],
  ['similar_window_months', '12', '「无新增同类失信」的观察期（月）'],
  ['required_conditions', 'obligation,rectify,nomore', '参与判定的前置条件，逗号分隔（obligation=已履行义务, rectify=已整改, nomore=无新增同类）；留空表示三项全要'],
  ['objection_sla_days', '3', '平台对异议函的答复时限（工作日）'],
  ['minor_fine_cap', '50000', '较低数额罚款上限：经营主体五万元以下，须与从轻或减轻阶次同时成立（107号令第七条）'],
  ['person_fine_cap', '5000', '较低数额罚款上限：相关责任人员五千元以下（107号令第七条）'],
  ['cert_valid_months', '12', '办理进度记录有效期（月）']
];

const TEMPLATES = [
  ['apply', '信用修复申请书', `<h4>信用修复申请书</h4>
<div class="meta">受理机关：{{authority}}</div>
<p class="no-indent">{{authority}}：</p>
<p>申请人<span class="lock">{{name}}</span>（统一社会信用代码：<span class="lock">{{code}}</span>），法定代表人<span class="lock">{{legal}}</span>。因<span class="lock">{{event}}</span>，于<span class="lock">{{listedCN}}</span>被列入失信名单（决定书文号：<span class="lock">{{docNo}}</span>）。</p>
<p>列入后，本企业已按要求完成整改、履行相关义务，{{removedText}}现公示期已届满，本企业无新增同类失信记录，符合《失信行为纠正后的信用信息修复管理办法（试行）》规定的修复条件。</p>
<p>据此，申请对上述失信信息予以信用修复，停止公示并同步更新相关平台信息。</p>
<p>随附《守信承诺书》《整改情况说明》及证明材料，所提交材料真实、合法、有效，如有虚假，愿承担相应法律责任。</p>
{{sign}}`],

  ['promise', '守信承诺书', `<h4>守信承诺书</h4>
<div class="meta">承诺主体：{{name}}</div>
<p>本企业就信用修复事项作出如下承诺：</p>
<p>一、已如实履行行政处罚决定或列入决定所确定的义务，整改措施已落实到位，相关证明材料真实有效。</p>
<p>二、自本承诺作出之日起，按《企业信息公示暂行条例》要求于每年 1 月 1 日至 6 月 30 日期间报送上一年度年度报告并公示。</p>
<p>三、建立内部信用管理制度，指定专人负责年报与公示信息核对，避免同类问题再次发生。</p>
<p>四、如违反上述承诺，自愿接受行政机关依法处理，并承担由此产生的信用后果。</p>
{{sign}}`],

  ['rectify', '整改情况说明', `<h4>整改情况说明</h4>
<div class="meta">{{name}}</div>
<p>一、问题成因。{{cause}}</p>
<p>二、整改措施。{{measure}}</p>
<p>三、整改结果。{{result}}</p>
<p>四、后续安排。本企业将按法定期间报送年度报告，定期核对公示信息，并接受社会监督。</p>
{{sign}}`],

  ['auth', '授权委托书', `<h4>授权委托书</h4>
<div class="meta">委托事项：办理信用修复申请</div>
<p>委托人：<span class="lock">{{name}}</span>（统一社会信用代码：<span class="lock">{{code}}</span>）</p>
<p>受托人：{{agent}}　身份证号：{{agentId}}</p>
<p>兹授权受托人代表本企业办理上述失信信息的信用修复申请、材料递交、补正及结果领取等事宜，授权期限自签署之日起 6 个月。</p>
<p>受托人在授权范围内的行为，视为本企业行为，法律后果由本企业承担。</p>
{{sign}}`],

  ['list', '材料目录与证明清单', `<h4>材料目录与证明清单</h4>
<div class="meta">共 {{count}} 项</div>
<p class="no-indent">1. 信用修复申请书（原件 1 份）</p>
<p class="no-indent">2. 守信承诺书（原件 1 份）</p>
<p class="no-indent">3. 整改情况说明（原件 1 份）</p>
<p class="no-indent">4. 营业执照复印件（加盖公章）</p>
<p class="no-indent">5. {{proofName}}（复印件）</p>
<p>以上材料均与原件一致，如有不符，由本企业承担相应责任。</p>
{{sign}}`]
];

module.exports = async function seed({ all, one, run }) {
  // 账号
  const pwd = hashPassword(PWD);
  await run('INSERT INTO users (phone, pwd_hash, name, role) VALUES (?,?,?,?)', ['13907320001', pwd, '周立恒', 'enterprise']);
  await run('INSERT INTO users (phone, pwd_hash, name, role) VALUES (?,?,?,?)', ['13907320002', pwd, '李雨桐', 'org']);
  await run('INSERT INTO users (phone, pwd_hash, name, role) VALUES (?,?,?,?)', ['18600000000', pwd, '平台运营', 'admin']);

  await run('INSERT INTO orgs (name, type, credit_code, contact, phone) VALUES (?,?,?,?,?)',
    ['湘潭高新区创业服务中心', 'park', '12430300MB1A2C3D4E', '李雨桐', '13907320002']);
  await run('INSERT INTO org_members (org_id, user_id, role) VALUES (1, 2, ?)', ['owner']);

  const entIds = [];
  for (const e of ENTERPRISES) {
    const r = await run(
      'INSERT INTO enterprises (name, credit_code, legal, industry, region, scale, contact, phone) VALUES (?,?,?,?,?,?,?,?)', e);
    entIds.push(r.insertId);
  }
  // 演示账号绑定第一家企业
  await run('INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES (?,?,\'owner\')', [entIds[0], 1]);
  await run('INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES (?,?,\'staff\')', [entIds[1], 1]);
  // 第 4 家企业：演示「罚 3 万但裁量阶次为一般」应按一般失信处理（同一负责人名下另一家企业）
  await run('INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES (?,?,\'owner\')', [entIds[3], 1]);
  await run('INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES (?,?,\'owner\')', [entIds[6], 1]);
  // 默认提供两家获授权企业，机构账号首次登录即可展示跨企业事项管理。
  for (const enterpriseId of [entIds[0], entIds[6]]) {
    await run("INSERT INTO org_enterprises (org_id,enterprise_id,perm,note) VALUES (1,?,'write',?)",
      [enterpriseId, '竞赛演示：企业授权园区协作管理与渠道复查（示例数据）']);
  }

  for (const c of CASES) {
    const enterpriseId = entIds[c[1] - 1];
    await run(`INSERT INTO cases (id, enterprise_id, type, event, authority, doc_no, listed_date, removed_date, level, stage, progress, apply_from, due_date, fine_amount, discretion)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c[0], enterpriseId, c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], c[13], c[14]]);
  }

  // 轻微失信演示案例：把履行、整改、无新增同类登记完整，便于看到「无需申请」的结论
  await run(`UPDATE cases SET obligation_at='2026-08-28', rectified=1, rectify_at='2026-09-05', no_new_similar=1
             WHERE id='XF-2026-000455'`);
  // 一般失信的演示案例：罚 3 万但裁量阶次为一般，条件满足后应「可申请」而非「自动停止」
  await run(`UPDATE cases SET obligation_at='2025-09-10', rectified=1, rectify_at='2025-09-20', no_new_similar=1
             WHERE id='XF-2026-000298'`);
  // 已修复的历史案例：三项条件与移出日期都要有登记，否则结论会显示「待确认」
  await run(`UPDATE cases SET obligation_at='2024-07-05', rectified=1, rectify_at='2024-07-18', no_new_similar=1
             WHERE id='XF-2026-000240'`);
  // 草稿状态的一般案例：仍在准备阶段，没有官方结果；「有新增同类失信」是它的阻塞点
  await run(`UPDATE cases SET obligation_at='2025-07-20', rectified=1, rectify_at='2025-08-05', no_new_similar=0
             WHERE id='XF-2026-000352'`);
  // 新示例不伪造官方结果或渠道数据，保留实际的材料准备状态。
  await run("UPDATE cases SET rectified=0,no_new_similar=1 WHERE id='XF-DEMO-20261102-01'");

  for (const ch of CHANNELS) {
    await run(`INSERT INTO case_channels (case_id, channel_code, channel_name, state, note, last_checked_at, sort)
               VALUES (?,?,?,?,?,?,?)`, ch);
  }

  for (const t of TIMELINE) {
    await run('INSERT INTO timeline_events (case_id, at, actor, action, detail) VALUES (?,?,?,?,?)', t);
  }

  for (const [caseId, name, owner, due, status] of TASKS) {
    await run('INSERT INTO tasks (case_id, name, owner, due_date, status) VALUES (?,?,?,?,?)', [caseId, name, owner, due, status]);
  }

  for (const p of POLICIES) {
    await run('INSERT INTO policies (title, issuer, published_at, effective_at, level, summary, url, tags) VALUES (?,?,?,?,?,?,?,?)', p);
  }

  for (const a of KB) {
    await run('INSERT INTO kb_articles (category, title, body) VALUES (?,?,?)', a);
  }

  for (const [k, v, note] of RULES) {
    await run('INSERT INTO rule_params (pkey, pvalue, note) VALUES (?,?,?)', [k, v, note]);
  }

  for (const [docKey, title, body] of TEMPLATES) {
    await run('INSERT INTO doc_templates (doc_key, version, title, slots, body) VALUES (?,?,?,?,?)',
      [docKey, 1, title, JSON.stringify([]), body]);
  }


  // 演示证据材料：回执用于推进「已提交/审核中」，官方结果用于登记「已修复」与生成办理进度记录。
  // 内容是极简 PDF，仅证明流程可走通；真实使用时由企业上传原件并人工核录。
  const crypto=require('node:crypto');
  const miniPdf = (title) => Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'+
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'+
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n'+
    '4 0 obj<</Length 62>>stream\nBT /F1 14 Tf 60 760 Td (' + title + ') Tj ET\nendstream endobj\n'+
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n'+
    'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

  const EVIDENCE = [
    ['seed-receipt-437', 'XF-2026-000437', 'receipt', '受理回执.pdf',
      '湘潭市市场监督管理局', '2025-09-15', 'reviewed'],
    ['seed-official-437', 'XF-2026-000437', 'official_result', '移出经营异常名录决定书.pdf',
      '湘潭市市场监督管理局', '2025-09-15', 'reviewed'],
    ['seed-official-240', 'XF-2026-000240', 'official_result', '移出经营异常名录决定书.pdf',
      '湘潭市雨湖区市场监督管理局', '2024-08-01', 'reviewed'],
    ['seed-receipt-298', 'XF-2026-000298', 'receipt', '受理回执.pdf',
      '湘潭市市场监督管理局', '2025-09-10', 'reviewed'],
    ['seed-official-298', 'XF-2026-000298', 'official_result', '行政处罚信息修复决定书.pdf',
      '湘潭市市场监督管理局', '2025-09-20', 'reviewed']
  ];
  for (const [id, caseId, kind, filename, source, observed, review] of EVIDENCE) {
    const buf = miniPdf(filename.replace(/\.pdf$/, ''));
    const digest = crypto.createHash('sha256').update(buf).digest('hex');
    await run(`INSERT INTO evidence_files
      (id, case_id, kind, filename, media_type, byte_size, content, digest, source, observed_at,
       uploaded_by, review_status, reviewed_by, reviewed_at, review_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
      [id, caseId, kind, filename, 'application/pdf', buf.length, buf, digest, source, observed,
       1, review, 3, '演示数据：已人工核录']);
  }


  // 演示案件的定稿材料：模板里的【待补充/待填写/待核对】占位已补成可提交文本。
  // 不补的话材料一致性校验不通过、导出会被拦（这是产品规则，不是 bug）。
  try {
    const demoDocs = require('./demo-docs.json');
    for (const d of demoDocs) {
      await run(`INSERT INTO case_docs (case_id, doc_key, html, status, source, version, updated_by)
                 VALUES (?,?,?,'final','manual',1,1)
                 ON DUPLICATE KEY UPDATE html = VALUES(html)`,
        ['XF-2026-000437', d.key, d.html]);
    }
  } catch (e) { /* 无定稿样本时跳过 */ }

  return { ok: true };
};
