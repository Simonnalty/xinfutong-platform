-- ============================================================================
-- 信复通 · 规则版本种子数据（按现行法规核验）
--
-- 依据：市场监督管理信用修复管理办法（市场监管总局令第107号）
--       2025-11-21 公布，2025-12-25 施行
--       原文：https://www.gov.cn/zhengce/202512/content_7050596.htm
--
-- 说明：
-- 1. 只覆盖 type 为 penalty / abnormal 的两类（L1 完整支持）。L2/L3 类型
--    不参与自动判定，不需要规则版本。
-- 2. 规则引擎的 match() 要求「恰好命中一条」，因此每个 (case_type, level)
--    组合只能有一条已复核规则。同一组合的多条规则会导致诊断退回待复核。
-- 3. authority_match 为子串匹配，取「市场监督管理局」可同时匹配市级与区级。
-- 4. 幂等写法：INSERT ... SELECT ... WHERE NOT EXISTS，重复执行不新增。
-- 5. 回滚：见文件末尾。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 一、行政处罚信息 · 一般失信
--     107 号令第九条：最短公示期三个月，最长公示期一年。
--     公示期满三个月，符合第十一条条件的可申请修复；
--     公示期满一年，由市场监管部门停止公示。
-- ---------------------------------------------------------------------------
INSERT INTO rule_versions
  (rule_key, version, title, case_type, level, authority_match, source_url,
   effective_from, effective_until, review_status, review_note, definition, created_by)
SELECT
  'penalty-general-107', 1,
  '市场监督管理领域一般违法失信信息信用修复',
  'penalty', 'general', '市场监督管理局',
  'https://www.gov.cn/zhengce/202512/content_7050596.htm',
  '2025-12-25', NULL, 'reviewed',
  '依据市场监管总局令第107号第九条。一般违法失信信息指除第七条、第八条规定情形外的其他行政处罚信息。最短公示期三个月，最长公示期一年；公示期满三个月且符合第十一条三项条件可申请修复，期满一年自动停止公示。',
  '{"months":3,"reviewDays":7,"materials":["apply","subject","promise","rectify"],"basis":[{"law":"市场监督管理信用修复管理办法 第九条","text":"一般违法失信信息，是指除第七条、第八条规定情形外的其他行政处罚信息。最短公示期为三个月，最长公示期为一年。公示期满三个月的，符合第十一条规定条件的当事人可以向作出行政处罚决定的市场监督管理部门申请信用修复；公示期满一年的，由市场监督管理部门停止公示。"}],"rejectReasons":["未完全履行行政处罚决定中规定的义务，如罚款未缴清","未主动采取整改措施，危害后果或不良影响未消除","因同一类违法行为再次受到市场监督管理部门行政处罚","公示期尚未届满最短公示期三个月","申请材料不齐全或不符合法定形式，如缺少申请人主体资格文件、守信承诺书","向非作出该行政处罚决定的机关提出申请"]}',
  3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM rule_versions WHERE rule_key = 'penalty-general-107');

-- ---------------------------------------------------------------------------
-- 二、行政处罚信息 · 严重失信
--     107 号令第八条：最短公示期一年，最长公示期三年。
--     第一项（食品药品、医疗器械、化妆品、特种设备、重点工业产品领域）
--       公示满一年可申请，满三年自动停止。
--     第二项（限制生产经营、责令停产停业、限制从业）
--       公示满一年且行政处罚限制期限届满可申请。
--     第三项（降低资质等级、吊销许可证件、吊销营业执照、责令关闭）
--       只能待公示期满三年自动停止，不存在提前修复路径。
--     注：系统当前以 level=serious 统一命中本条规则，未细分第一至第三项。
--         第三项的实际处理差异见 rejectReasons 首条提示。
-- ---------------------------------------------------------------------------
INSERT INTO rule_versions
  (rule_key, version, title, case_type, level, authority_match, source_url,
   effective_from, effective_until, review_status, review_note, definition, created_by)
SELECT
  'penalty-serious-107', 1,
  '市场监督管理领域严重违法失信信息信用修复',
  'penalty', 'serious', '市场监督管理局',
  'https://www.gov.cn/zhengce/202512/content_7050596.htm',
  '2025-12-25', NULL, 'reviewed',
  '依据市场监管总局令第107号第八条。严重违法失信信息最短公示期一年、最长三年。第一项领域类公示满一年可申请；第二项须同时满足限制期限届满；第三项（降低资质等级、吊销证照、责令关闭）只能待三年期满自动停止，不可申请提前修复。本条未细分三项差异，第三项情形由驳回原因首条提示。',
  '{"months":12,"reviewDays":7,"materials":["apply","subject","promise","rectify"],"basis":[{"law":"市场监督管理信用修复管理办法 第八条","text":"严重违法失信信息最短公示期为一年，最长公示期为三年。属食品、药品、医疗器械、化妆品、特种设备、重点工业产品领域的，公示期满一年可申请修复；属限制开展生产经营活动、责令停产停业、限制从业的，还须行政处罚限制期限届满；属降低资质等级、吊销许可证件、吊销营业执照、责令关闭的，公示期满三年由市场监督管理部门停止公示。"}],"rejectReasons":["属于降低资质等级、吊销许可证件、吊销营业执照、责令关闭情形，依 107 号令第八条第三项只能待公示期满三年自动停止公示，不能申请提前修复","属于限制开展生产经营活动、责令停产停业、限制从业情形，行政处罚限制期限尚未届满","未完全履行行政处罚决定中规定的义务","未主动采取整改措施，危害后果或不良影响未消除","因同一类违法行为再次受到市场监督管理部门行政处罚","公示期尚未届满最短公示期一年"]}',
  3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM rule_versions WHERE rule_key = 'penalty-serious-107');

-- ---------------------------------------------------------------------------
-- 三、行政处罚信息 · 轻微失信
--     107 号令第七条：仅受到警告的不予公示；
--     仅受到通报批评、仅受到较低数额罚款的，公示期满三个月由市场监管部门
--     停止公示。较低数额罚款须同时满足：按从轻或减轻处罚的裁量阶次，
--     且经营主体五万元以下、相关责任人员五千元以下。
--     注：本类为「到期自动停止公示」，无需当事人申请。
--         autoStopOnly 字段供前端识别，提示「无需申请」。
-- ---------------------------------------------------------------------------
INSERT INTO rule_versions
  (rule_key, version, title, case_type, level, authority_match, source_url,
   effective_from, effective_until, review_status, review_note, definition, created_by)
SELECT
  'penalty-minor-107', 1,
  '市场监督管理领域轻微违法失信信息停止公示',
  'penalty', 'minor', '市场监督管理局',
  'https://www.gov.cn/zhengce/202512/content_7050596.htm',
  '2025-12-25', NULL, 'reviewed',
  '依据市场监管总局令第107号第七条。仅警告不予公示；仅通报批评或仅较低数额罚款的，公示期满三个月由市场监管部门停止公示，无需当事人申请。较低数额罚款须同时满足「从轻或减轻处罚的裁量阶次」与「经营主体五万元以下、责任人员五千元以下」两项条件，缺一即不属于轻微。',
  '{"months":3,"reviewDays":7,"autoStopOnly":true,"materials":["apply","subject","promise","rectify"],"basis":[{"law":"市场监督管理信用修复管理办法 第七条","text":"仅受到警告的行政处罚信息不予公示；仅受到通报批评、仅受到较低数额罚款的，公示期满三个月由市场监督管理部门停止公示。较低数额罚款是指按照从轻或者减轻处罚的裁量阶次，对经营主体处以五万元以下、对相关责任人员处以五千元以下的罚款。"}],"rejectReasons":["罚款数额虽在五万元以下，但不属于从轻或减轻处罚的裁量阶次，应定为一般或严重失信信息而非轻微","仅受到警告的行政处罚信息本不予公示，无需办理","公示期尚未届满三个月"]}',
  3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM rule_versions WHERE rule_key = 'penalty-minor-107');

-- ---------------------------------------------------------------------------
-- 四、经营异常名录 · 一般
--     107 号令第十二条：符合五种情形之一即可申请移出，无公示期等待要求。
--     第十六条：自受理之日起两个工作日内作出决定。
--     第十六条中「通过登记住所无法取得联系」的，自核实之日起两个工作日。
-- ---------------------------------------------------------------------------
INSERT INTO rule_versions
  (rule_key, version, title, case_type, level, authority_match, source_url,
   effective_from, effective_until, review_status, review_note, definition, created_by)
SELECT
  'abnormal-general-107', 1,
  '移出经营异常名录',
  'abnormal', 'general', '市场监督管理局',
  'https://www.gov.cn/zhengce/202512/content_7050596.htm',
  '2025-12-25', NULL, 'reviewed',
  '依据市场监管总局令第107号第十二条、第十六条。符合五种情形之一即可申请移出，法规未规定最短公示期，无等待期。受理后两个工作日内作出决定。第一百一十条（原文第十六条）另规定通过登记住所无法取得联系的，自核实之日起两个工作日。',
  '{"months":0,"reviewDays":2,"materials":["apply","subject","promise","rectify"],"basis":[{"law":"市场监督管理信用修复管理办法 第十二条、第十六条","text":"被列入经营异常名录的当事人，已补报并公示未报年份年度报告、已履行信息公示义务、已依法完成企业名称变更登记、已重新取得联系或完成住所变更登记、已改正其他违法行为的，可以向登记地市场监督管理部门申请移出。市场监督管理部门应当自受理之日起两个工作日内作出决定。法规未规定最短公示期，无等待期。"}],"rejectReasons":["未补报、公示未报年份的年度报告","未履行市场监督管理部门责令期限内的信息公示义务","未依法完成企业名称变更登记","通过登记的住所或经营场所无法取得联系，且未完成变更登记或未重新取得联系","被列入的违法行为尚未改正","申请材料不齐全，如缺少申请人主体资格文件"]}',
  3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM rule_versions WHERE rule_key = 'abnormal-general-107');

-- ---------------------------------------------------------------------------
-- 五、经营异常名录 · 轻微
--     同第十二条，不因等级而区别对待；单列一条以满足 level 精确匹配。
-- ---------------------------------------------------------------------------
INSERT INTO rule_versions
  (rule_key, version, title, case_type, level, authority_match, source_url,
   effective_from, effective_until, review_status, review_note, definition, created_by)
SELECT
  'abnormal-minor-107', 1,
  '移出经营异常名录',
  'abnormal', 'minor', '市场监督管理局',
  'https://www.gov.cn/zhengce/202512/content_7050596.htm',
  '2025-12-25', NULL, 'reviewed',
  '依据市场监管总局令第107号第十二条、第十六条。经营异常名录不区分失信等级，移出条件与一般等级相同，无等待期，受理后两个工作日内作出决定。',
  '{"months":0,"reviewDays":2,"materials":["apply","subject","promise","rectify"],"basis":[{"law":"市场监督管理信用修复管理办法 第十二条、第十六条","text":"经营异常名录不区分失信等级，移出条件与一般等级相同：符合第十二条规定情形之一的即可申请移出，无最短公示期要求。市场监督管理部门应当自受理之日起两个工作日内作出决定。"}],"rejectReasons":["未补报、公示未报年份的年度报告","未履行市场监督管理部门责令期限内的信息公示义务","未依法完成企业名称变更登记","通过登记的住所或经营场所无法取得联系，且未完成变更登记或未重新取得联系","申请材料不齐全，如缺少申请人主体资格文件"]}',
  3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM rule_versions WHERE rule_key = 'abnormal-minor-107');

-- ---------------------------------------------------------------------------
-- 六、规则参数（rule_params）同步为现行法规值
--     注意：min_months.* 仅作后台展示与文档对照，实际判定取 rule_versions
--           .definition.months。review_days 同理，判定取 definition.reviewDays。
-- ---------------------------------------------------------------------------
INSERT INTO rule_params (pkey, pvalue, note) VALUES
  ('min_months.minor',   '3',  '轻微失信信息公示期满三个月由市场监管部门停止公示（107号令第七条）'),
  ('min_months.general', '3',  '一般失信信息最短公示期三个月（107号令第九条）'),
  ('min_months.serious', '12', '严重失信信息最短公示期一年（107号令第八条）'),
  ('min_months.severe',  '36', '列入严重违法失信名单的公示期三年（107号令第十三条）'),
  ('review_days',        '7',  '行政处罚信息及严重违法失信名单修复：受理后七个工作日内作出决定（107号令第十六条）'),
  ('review_days_abnormal','2', '经营异常名录移出：受理后两个工作日内作出决定（107号令第十六条）'),
  ('no_similar_window_months', '0', '「未因同一类违法行为再次受罚」不作时间限制，0 表示不设窗口（107号令第十一条第三项）'),
  ('required_conditions', 'obligation,rectify,nomore', '参与判定的前置条件，逗号分隔（107号令第十一条）'),
  ('minor_fine_cap', '50000', '较低数额罚款上限：对经营主体五万元以下（107号令第七条）；须与从轻或减轻的裁量阶次同时成立'),
  ('person_fine_cap', '5000', '较低数额罚款上限：对相关责任人员五千元以下（107号令第七条）')
ON DUPLICATE KEY UPDATE pvalue = VALUES(pvalue), note = VALUES(note);

-- 旧参数已由 no_similar_window_months 取代，删除以免两套口径并存
DELETE FROM rule_params WHERE pkey = 'similar_window_months';

-- ---------------------------------------------------------------------------
-- 校验
-- ---------------------------------------------------------------------------
SELECT rule_key, case_type, level, review_status,
       JSON_EXTRACT(definition, '$.months')      AS months,
       JSON_EXTRACT(definition, '$.reviewDays')  AS review_days
FROM rule_versions ORDER BY case_type, level;

SELECT pkey, pvalue FROM rule_params ORDER BY pkey;

-- ---------------------------------------------------------------------------
-- 回滚（需要时单独执行）
-- ---------------------------------------------------------------------------
-- DELETE FROM rule_versions WHERE rule_key IN
--   ('penalty-general-107','penalty-serious-107','penalty-minor-107',
--    'abnormal-general-107','abnormal-minor-107');
