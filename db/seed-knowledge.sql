-- ============================================================
-- 信复通 · 合规知识库种子数据
-- 生成日期：2026-10-31
-- 内容来源：docs/信用修复法规核验与合规知识库-2026-10-31.md 第七节
--
-- 使用方式（不要直接 source，先看下面说明）：
--   "D:\Program Files\MySQL\bin\mysql.exe" -h 127.0.0.1 -u xft -p ^
--       --default-character-set=utf8mb4 xinfutong_windows < db/seed-knowledge.sql
--
-- 特性：
--   1. 幂等 —— 用 WHERE NOT EXISTS 按 title 判重，重复执行不会产生重复行
--   2. 可回滚 —— 文件末尾附了清理语句（默认注释）
--   3. 全部条目 review_status='reviewed'，导入后前端「合规知识库」立即可见
--      如需改为待审，执行文件末尾的 UPDATE
--
-- 注意：created_by = 3，对应运营账号 18600000000（平台运营 / admin）
--       若你的运营账号 id 不是 3，请先执行：
--       SELECT id FROM users WHERE role='admin';
--       然后批量替换本文件中的 created_by 值
-- ============================================================

SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- policy 类：法规政策（11 条）
-- ------------------------------------------------------------

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','失信信息统一分为轻微、一般、严重三类',
 '依据国办发〔2025〕22号第二项，失信信息分为三类：轻微失信信息可不予公示或法定责任义务履行完毕即可申请修复，确需公示的公示期最长3个月；一般失信信息公示期最短3个月、最长1年；严重失信信息公示期最短1年、最长3年。各领域具体分类标准由行业主管部门制定并在「信用中国」网站统一发布。',
 'https://www.gov.cn/zhengce/content/202506/content_7029483.htm','国务院办公厅','2025-06-22','reviewed',
 '2026-10-31 依据国办发〔2025〕22号原文核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='失信信息统一分为轻微、一般、严重三类');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','市场监管行政处罚信息的修复条件',
 '依据市场监管总局令第107号第十一条，最短公示期届满后申请信用修复，应同时符合：①已经自觉履行行政处罚决定中规定的义务；②已经主动采取相关整改措施，消除危害后果和不良影响；③未因同一类违法行为再次受到市场监督管理部门行政处罚。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验；该令2025-12-25施行，替代2021年旧办法',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='市场监管行政处罚信息的修复条件');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','仅受警告的处罚信息不予公示',
 '依据107号令第七条，仅受到警告的行政处罚信息不予公示；仅受通报批评、仅受较低数额罚款（经营主体5万元以下、相关责任人员5000元以下）的，公示期满3个月由市场监管部门停止公示。此类信息不存在「申请修复」环节。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='仅受警告的处罚信息不予公示');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','吊销证照类不适用提前修复',
 '依据107号令第八条，降低资质等级、吊销许可证件、吊销营业执照、责令关闭的行政处罚信息，公示期届满3年的，由市场监管部门停止公示。该类情形未规定可申请提前停止公示。企业遇到此类情形只能等待到期，无需反复申请。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='吊销证照类不适用提前修复');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','经营异常名录移出的五种情形',
 '依据107号令第十二条，被列入经营异常名录的当事人，符合下列条件之一即可向登记地市场监管部门申请移出：①未按期报送公示年报的，已补报并公示未报年份年报；②未按责令期限公示企业信息的，已履行公示义务；③未依法办理名称变更登记的，已完成变更登记；④通过登记住所无法取得联系的，已完成住所变更登记或可重新取得联系；⑤因其他违法行为被列入的，已改正该违法行为。移出同时停止公示列入信息。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验；注意本条无最短公示期要求，属「即办」类',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='经营异常名录移出的五种情形');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','严重违法失信名单的移出条件',
 '依据107号令第十三条，被列入市场监督管理严重违法失信名单的当事人，公示期满1年后可申请移出，条件为：①已自觉履行行政处罚、行政裁决等行政决定中规定的义务；②已主动采取整改措施，消除危害后果和不良影响；③未再受到市场监管部门较重行政处罚。公示期满3年的，由市场监管部门移出。依法律、行政法规实施的管理措施期限尚未届满的，不得提前移出。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='严重违法失信名单的移出条件');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','重大税收违法失信主体的修复条件',
 '依据国家税务总局令第54号第十八条，符合下列条件之一可申请提前停止公布：①按税务处理决定书、处罚决定书缴清（退）税款、滞纳金、罚款，且失信信息公布满6个月；②破产，法院出具批准重整计划或认可和解协议裁定书，税务机关依法受偿；③突发事件期间因抢险救灾、疫情防控、重大项目建设或履行社会责任作出突出贡献。公布满3年的自动撤出，无需申请。',
 'https://www.chinatax.gov.cn/chinatax/n810214/n810641/c102061/c102062/c5171873/content.html','国家税务总局','2022-02-01','reviewed',
 '2026-10-31 依据总局令第54号原文核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='重大税收违法失信主体的修复条件');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','海关失信信息的修复条件',
 '依据海关总署令第282号第三十六条，企业纠正违法行为、消除不良影响，且符合下列条件的可申请修复：①一般失信信息公示满3个月，或严重失信信息公示满1年；②作出信用承诺；③法律、行政法规、海关总署规定的其他条件。海关自收到申请3个工作日内决定是否受理，受理之日起7个工作日内作出修复决定，情况复杂可延长10个工作日。',
 'https://www.gov.cn/gongbao/2026/issue_12746/202605/content_7069427.html','海关总署','2026-04-01','reviewed',
 '2026-10-31 依据海关总署令第282号原文核验；该令2026-04-01施行，替代251号令',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='海关失信信息的修复条件');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','法院失信被执行人不适用行政信用修复',
 '依据法释〔2017〕7号，纳入失信被执行人名单的期限为2年，情节严重可延长1至3年。被执行人积极履行义务或主动纠正失信行为的，人民法院可以决定提前删除失信信息。删除路径为：全部履行完毕、达成执行和解并履行完毕、人民法院裁定终结执行。该程序由执行法院依职权处理，不属于行政机关信用修复的受理范围。',
 'https://www.court.gov.cn/fabu/xiangqing/37172.html','最高人民法院','2017-05-01','reviewed',
 '2026-10-31 依据法释〔2017〕7号原文核验；本类不进平台自动判定，仅作说明',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='法院失信被执行人不适用行政信用修复');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','罚款金额相同，失信等级可能相反（关键判定规则）',
 '依据107号令第七条，「较低数额罚款」须同时满足两个条件：①按从轻或者减轻处罚的裁量阶次；②经营主体5万元以下、相关责任人员5000元以下。缺任一条件即不属于轻微。同一笔3万元罚款，按从轻或减轻阶次作出的属轻微信息，公示满3个月自动停止；非从轻减轻阶次作出的，重点领域属严重信息（最短公示期1年），非重点领域属一般信息（最短公示期3个月）。重点领域按处罚决定书所依据的法律认定，重点工业产品范围以《全国重点工业产品质量安全监管目录》为准。',
 'https://scjgj.yancheng.gov.cn/art/2026/9/20/art_21470_4455305.html','市场监管总局 / 盐城市市场监管局','2026-09-20','reviewed',
 '2026-10-31 依据107号令第七条与盐城市局服务指南交叉核验；本条是平台判定的关键，仅采集罚款金额会判错',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='罚款金额相同，失信等级可能相反（关键判定规则）');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'policy','「信用修复」与「征信修复」是两回事',
 '信用修复指公共信用信息领域的修复机制，针对「信用中国」等平台公示的行政处罚信息、严重失信主体名单，由各级社会信用体系建设牵头部门协调监督。而「征信修复」在现行法规和政策中并无此概念，以「征信修复」「征信洗白」「征信铲单」为噱头的宣传或广告均涉嫌虚假宣传。金融信用信息基础数据库中的信息，除确有错误、遗漏外，任何机构或个人无权擅自修改或删除。',
 'https://www.jian.gov.cn/news-show-108206.html','中国人民银行吉安市分行、吉安市市场监督管理局、吉安市行政审批局',NULL,'reviewed',
 '2026-10-31 依据三部门联合公告核验；本条同时是平台文案红线依据',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='「信用修复」与「征信修复」是两回事');

-- ------------------------------------------------------------
-- guide 类：办理指引（6 条）
-- ------------------------------------------------------------

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','市场监管信用修复的四类申请材料',
 '依据107号令第十四条，申请信用修复应提交：①信用修复申请书；②申请人主体资格文件；③守信承诺书；④履行法定义务、纠正违法行为、实施整改等相关材料。能通过政务信息共享平台获取的材料，市场监管部门不得要求重复提供。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验；注意含「申请人主体资格文件」，旧清单易漏',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='市场监管信用修复的四类申请材料');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','市场监管信用修复的办理时限',
 '依据107号令第十四至十七条：材料齐全的，自收到申请2个工作日内受理；申请移出经营异常名录的，自受理2个工作日内作出决定；申请停止公示行政处罚信息或移出严重违法失信名单的，自受理7个工作日内作出决定，情况复杂经批准可延长10个工作日；准予修复的，自决定作出3个工作日内完成数据处理。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验；较2021年旧办法的15个工作日已缩短',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='市场监管信用修复的办理时限');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','经营异常名录的线上办理路径',
 '通过国家企业信用信息公示系统（https://www.gsxt.gov.cn）首页「信用修复」入口，使用电子营业执照扫码登录后在线提交。也可到登记地市场监管部门现场申请。移出经营异常名录不收取任何费用。申请材料模板可在公示系统下载。2025年3月起，市场监管信用修复全国统一平台已上线，支持跨省异地办理。',
 'https://www.gsxt.gov.cn','国家企业信用信息公示系统',NULL,'reviewed',
 '2026-10-31 依据公示系统入口与总局公开答问核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='经营异常名录的线上办理路径');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','信用修复不收取任何费用',
 '市场监管部门办理年报公示、移出经营异常名录、信用修复，均不收取任何费用，也未授权或委托任何第三方收费代办。凡以「加快修复」「内部渠道」「包过」为名收取费用或索要财物的，均非官方行为。企业信用修复是政府提供的公共服务，须先纠正失信行为、履行义务、达到最短公示期，才能通过官方渠道申请。不存在付费删除记录的合法途径。',
 'https://cpc.people.com.cn/BIG5/n1/2026/0404/c64387-40695215.html','市场监管总局信用监管司','2026-04-04','reviewed',
 '2026-10-31 依据人民日报「政策问答·回应关切」专访市场监管总局信用监管司负责人核验',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='信用修复不收取任何费用');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','弄虚作假的后果',
 '依据107号令第二十三条，当事人在信用修复过程中故意隐瞒真实情况、弄虚作假的，不得准予修复；已准予的应撤销，恢复至修复前状态，公示期自撤销之日起重新计算且不得提前停止公示。同时该不予修复或撤销决定在公示系统公示3年，自决定作出之日起3年内不得申请信用修复。',
 'https://www.gov.cn/govweb/zhengce/202512/content_7050596.htm','市场监管总局','2025-12-25','reviewed',
 '2026-10-31 依据总局令第107号原文核验；本条支撑平台「不代填事实、不伪造材料」的产品红线',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='弄虚作假的后果');

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'guide','「两书同达」与修复告知',
 '依据国办发〔2025〕22号第四项，鼓励推广「两书同达」：向信用主体送达行政处罚决定书或列入严重失信主体名单决定书时，同步送达信用修复告知书，确保企业第一时间知晓修复政策。企业收到处罚决定书时，可一并确认修复的起算时间与最短公示期。告知书通常载明公示网站、最短公示期、修复流程与条件、办理渠道。',
 'https://www.gov.cn/zhengce/content/202506/content_7029483.htm','国务院办公厅','2025-06-22','reviewed',
 '2026-10-31 依据国办发〔2025〕22号原文核验；地方落地进度不一，湖南具体情况需另核',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='「两书同达」与修复告知');

-- ------------------------------------------------------------
-- case 类：典型案例（1 条）
-- ------------------------------------------------------------

INSERT INTO knowledge_entries
 (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
SELECT 'case','有偿删除失信信息的法律风险',
 '依法应当公示的失信信息，在法院、行政机关解除相关措施前，任何第三方无权删除。常见违法手段包括：伪造法院结案或撤销文书用于申诉（涉嫌伪造国家机关公文）、冒用企业名义伪造公章发起虚假投诉、买通平台人员删改数据、技术手段侵入官方系统篡改后台。整条产业链涉嫌非法经营、破坏计算机信息系统等犯罪，委托方与操作方均需担责。已有多起企业付费后对方失联的报案记录。',
 'https://www.cnr.cn/mspd/msyx/20260714/t20260714_527708969.shtml','央广网','2026-07-14','reviewed',
 '2026-10-31 依据央广网调查报道核验；报道含市场监管总局信用监管司、北京市市场监管局表态',3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='有偿删除失信信息的法律风险');

-- ============================================================
-- 未入库条目（暂缺可核验的公开链接，补到来源后再取消注释导入）
-- ------------------------------------------------------------
-- 条目：新规施行前的存量信息，从旧兼从轻（policy）
-- 内容：对107号令施行前已公示但尚未修复的存量信息，按「两者取其轻」判定：
--       新规公示期缩短、条件放宽的适用新规，新规延长公示期、收紧条件的沿用原规定，
--       不溯及既往增加经营主体负担。例如价格、广告等非重点领域一般处罚，
--       原最短公示期6个月，新规为3个月，可适用新规；食品领域5万元以下但
--       非从轻减轻阶次的处罚，原公示3个月，新规为1年，应沿用原规定。
-- 来源：《信用修复提质增效的制度升级与实践》（中国工商出版社）· 2026-08-18
-- 未入库原因：该来源为出版读物，无可公开访问的权威链接。
--             若需入库，建议先取得该书正式出版页或总局官方解读稿链接。
--
-- INSERT INTO knowledge_entries
--  (category,title,body,source_url,issuer,effective_at,review_status,review_note,created_by)
-- SELECT 'policy','新规施行前的存量信息从旧兼从轻',
--  '对107号令施行前已公示但尚未修复的存量信息，按「两者取其轻」判定：新规公示期缩短、条件放宽的适用新规，新规延长公示期、收紧条件的沿用原规定，不溯及既往增加经营主体负担。',
--  '【待补：官方链接】','中国工商出版社',NULL,'draft',
--  '待补可核验来源后再置为 reviewed',3
-- FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_entries WHERE title='新规施行前的存量信息从旧兼从轻');
-- ============================================================


-- ------------------------------------------------------------
-- 校验：导入后应看到 18 条，其中 policy 11 / guide 6 / case 1
-- ------------------------------------------------------------
SELECT category, COUNT(*) AS cnt FROM knowledge_entries
 WHERE review_status='reviewed' GROUP BY category;

SELECT id, category, title FROM knowledge_entries ORDER BY id;


-- ============================================================
-- 备用语句（默认注释，按需手动执行）
-- ============================================================

-- 【1】若希望这批内容先进入待审状态，由运营在后台逐条复核后再发布：
-- UPDATE knowledge_entries SET review_status='draft'
--  WHERE created_by=3 AND review_note LIKE '2026-10-31%';

-- 【2】完整回滚，清空本批导入的内容：
-- DELETE FROM knowledge_entries WHERE created_by=3 AND review_note LIKE '2026-10-31%';

-- 【3】若运营账号 id 不是 3，先查再改：
-- SELECT id,phone,name FROM users WHERE role='admin';
