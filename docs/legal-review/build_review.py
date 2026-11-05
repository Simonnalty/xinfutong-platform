"""Build the legal review handoff from a read-only local database snapshot."""
if __name__ == '__main__':
    raise SystemExit('旧版人工审核Excel已按用户要求删除，本生成器停用，避免重建已删除文件。请阅读同目录联网核查结果，打包使用 package_online_review.py。')

import json
import re
import shutil
import zipfile
from collections import Counter
from datetime import datetime
from html import unescape
from pathlib import Path
from zoneinfo import ZoneInfo

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = json.loads((HERE / 'data/review-snapshot.json').read_text())
INV = json.loads((ROOT / 'docs/credit-regulations/inventory.json').read_text())
NOW = datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M 北京时间')
WB = Workbook()
WB.remove(WB.active)
COUNTS = {}
EDIT = ['本次审核结论', '审核意见或修改后内容', '审核人', '审核日期']
OUT = HERE / '信复通-法学院人工审核表.xlsx'


def sheet(name, headers, rows, widths=None, editable=(), height=65):
    ws = WB.create_sheet(name)
    ws.append(headers)
    for row in rows:
        ws.append([str(v) if isinstance(v, (dict, list)) else v for v in row])
    COUNTS[name] = len(rows)
    ws.freeze_panes = 'C2' if len(headers) > 6 else 'A2'
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.zoomScale = 85
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = '1:1'
    ws.sheet_view.showGridLines = False
    for col, header in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(col)].width = (widths or {}).get(header, 24)
        cell = ws.cell(1, col)
        cell.fill = PatternFill('solid', fgColor='263F39')
        cell.font = Font(name='Arial', color='FFFFFF', bold=True, size=11)
        cell.alignment = Alignment(vertical='center', wrap_text=True)
        if header in editable:
            cell.comment = Comment('浅黄色列由法学院填写。原始资料列保留原文；修订内容填入意见列。', '信复通')
        for r in range(2, ws.max_row + 1):
            c = ws.cell(r, col)
            c.font = Font(name='Arial', size=11, color='263F39')
            c.alignment = Alignment(vertical='top', wrap_text=True)
            c.fill = PatternFill('solid', fgColor='FFF2CC' if header in editable else ('F1F5F1' if r % 2 == 0 else 'FFFFFF'))
            if isinstance(c.value, str):
                # Source text must never become an executable Excel formula.
                c.data_type = 's'
                if c.value.startswith(('https://', 'http://')):
                    c.hyperlink = c.value
                    c.font = Font(name='Arial', size=11, color='156082', underline='single')
    ws.row_dimensions[1].height = 36
    for r in range(2, ws.max_row + 1):
        ws.row_dimensions[r].height = height
    if '本次审核结论' in headers and rows:
        col = get_column_letter(headers.index('本次审核结论') + 1)
        dv = DataValidation(type='list', formula1='"待审核,通过,修改后通过,不通过,暂缓"', allow_blank=False)
        dv.errorTitle = '请选择审核结论'
        dv.error = '可填写：待审核、通过、修改后通过、不通过、暂缓。'
        dv.showErrorMessage = True
        ws.add_data_validation(dv)
        dv.add(f'{col}2:{col}{ws.max_row}')
    return ws


def review_tail():
    return ['待审核', '', '', '']


def plain(html):
    text = re.sub(r'</(?:p|div|h[1-6]|tr|li)>|<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    return unescape(text).strip()


summary = [
    ['用途', '供法学院核实法规、审阅规则和文书；审核后由技术人员逐项落实。本文件不是已通过的法律意见。'],
    ['生成时间', NOW],
    ['数据范围', '本地隔离演示数据库快照；不是公网服务器的数据导出。数据库完整结构附在 data/数据库结构快照.sql。'],
    ['数量', '53份法规文件；18条知识条目；5条诊断规则；12项参数；11版文书（6类，其中6个最新版本）；44张表、359个字段。数量为导出时快照。'],
    ['先看哪些表', '先审“诊断规则”“业务逻辑核查”“文书模板”，再审“当前知识库”和“法规总表”。法规可先从湖南及演示企业所属领域开始分工。'],
    ['颜色说明', '浅黄色列可填写；白色/浅绿色列为原始内容或技术说明，建议保留。所有“本次审核结论”初始均为“待审核”。'],
    ['填写方法', '每条填写审核结论、修改意见、审核人和日期（YYYY-MM-DD）。具体结论应在意见中注明文件全称、文号、条款及官方页面。需要修改时写完整替换文本。'],
    ['两种审核状态', '“项目原审核状态”来自现有数据，reviewed只是项目既有标记，不等于法学院已认可。以本次单独填写的结论为准。'],
    ['法规来源', '53份来自用户提供的信用条例.zip，48份已提取正文、5份旧DOC解析失败。49份核心候选/2份背景/2份其他主题是标题初筛，不是法律结论。全部仍待核验现行效力。'],
    ['日期与链接', '文件名日期、生效日期线索、项目已有URL均原样保留供核查。本次只做资料导出，没有重新联网验证法规效力或来源。'],
    ['条款摘录', '机器检索摘录不保证完整，不代表已核对的法条引用；必须回看官方全文及上下文。完整提取文本在 extracts/，原件在原始资料-信用条例.zip。'],
    ['文书版本', '“当前最新版本=是”是系统按doc_key最大version选用的模板；历史版本仅供追溯，不建议优先审核。占位符{{...}}保留；另有代码生成的异议函草稿单独收录。'],
    ['隐私范围', '没有导出企业档案、联系人、用户、密码、会话、附件、签名密钥或具体企业材料；字段字典仅列数据库结构。'],
    ['回传方式', '保持记录ID、规则key和文书key/版本不变，将填好的xlsx连同新增官方表格/出处附件交回。改Excel不会自动写入平台。'],
    ['实施边界', '本次未更改数据库或平台规则，未将未审核条例导入线上知识库；后续按意见修订、复核、验证后发布。'],
    ['示例', '“填写示例”页只有虚构格式演示，不计入真实审核结果。'],
]
sheet('使用说明', ['项目', '说明'], summary, {'项目': 24, '说明': 112}, height=55)
sheet('填写示例', ['示例ID', '示例内容', '本次审核结论', '审核意见或修改后内容', '官方出处', '审核人', '审核日期'], [[
    'EXAMPLE-001（虚构）', '此行只演示填写格式，请勿当作真实法规或审核意见。', '修改后通过',
    '示例：请补充适用地区与具体条号，再将此段替换为经核实的完整表述。', '示例：填写真实政府官网URL及条号；本示例无真实出处。', '示例审核人', '2026-11-03'
]], {'示例内容': 42, '审核意见或修改后内容': 60, '官方出处': 55}, height=85)

reg_headers = ['资料ID', '法规名称（原题）', '地区线索', '标题初筛分类', '正文提取', '原始文件名', '文件名日期（非生效日）', '生效日期原文线索', '全文相对路径', '官方来源（审核填写）', '发文机关及文号（审核填写）', '现行效力（审核填写）', '施行及失效日期（审核填写）', '版本替代关系（审核填写）', '适用范围与条号（审核填写）'] + EDIT
reg_rows, snippets = [], []
for d in INV['documents']:
    rid = f"REG-{d['id']:03d}"
    reg_rows.append([rid, d['title'], d['locality'], d['applicability'], '成功' if d['extraction_status'] == 'ok' else '失败，需转换DOC', d['filename'], d.get('filename_date_tag'), '\n'.join(d.get('effective_date_clues', [])), d.get('text_file') or '原件见压缩包，需补正文', '', '', '', '', '', ''] + review_tail())
    for n, text in enumerate(d.get('relevant_snippets', []), 1):
        snippets.append([f'{rid}-S{n:02d}', rid, d['title'], text, '机器检索片段；条号和上下文待人工核对', '', ''] + review_tail())
ws = sheet('法规总表', reg_headers, reg_rows, {'法规名称（原题）': 42, '原始文件名': 48, '生效日期原文线索': 55, '全文相对路径': 48, '审核意见或修改后内容': 60}, editable=reg_headers[9:], height=95)
for r in range(2, ws.max_row + 1):
    p = ws.cell(r, 9)
    if str(p.value).startswith('extracts/'):
        p.hyperlink = str(p.value)
sheet('条款摘录', ['摘录ID', '资料ID', '法规名称', '机器摘录原文', '摘录说明', '核对条号（填写）', '官方全文链接（填写）'] + EDIT, snippets, {'法规名称': 40, '机器摘录原文': 95, '摘录说明': 34, '审核意见或修改后内容': 65}, editable=['核对条号（填写）', '官方全文链接（填写）'] + EDIT, height=105)

knowledge = DATA['tables']['knowledge_entries']
rows = [[f"KB-{x['id']}", x['category'], x['title'], x['body'], x['source_url'], x['issuer'], x.get('effective_at'), x['review_status'], x.get('review_note')] + review_tail() for x in knowledge]
sheet('当前知识库', ['条目ID', '分类', '标题', '项目现有正文', '项目来源URL（待复核）', '项目发文机关', '项目生效日期', '项目原审核状态', '项目原审核说明'] + EDIT, rows, {'标题': 42, '项目现有正文': 105, '项目来源URL（待复核）': 50, '项目原审核说明': 55, '审核意见或修改后内容': 70}, editable=EDIT, height=150)

rules = DATA['tables']['rule_versions']
rule_rows = []
for x in rules:
    d = json.loads(x['definition']) if isinstance(x['definition'], str) else x['definition']
    basis = '\n\n'.join(b.get('law', '') + '\n' + b.get('text', '') for b in d.get('basis', []))
    rule_rows.append([x['rule_key'], x['version'], x['title'], x['case_type'], x['level'], x['authority_match'], d.get('months'), d.get('reviewDays'), '是' if d.get('autoStopOnly') else '否', ', '.join(d.get('materials', [])), basis, '\n'.join(d.get('rejectReasons', [])), x['source_url'], x['effective_from'], x.get('effective_until'), x['review_status'], x['review_note']] + review_tail())
sheet('诊断规则', ['规则key', '版本', '规则名称', '事项类型代码', '等级代码', '匹配机关关键词', '等待月数months', '参考天数reviewDays', '自动停止标记', '材料代码', '项目法条依据', '项目驳回原因提示', '项目来源URL（待复核）', '项目生效日', '项目失效日', '项目原审核状态', '项目原审核说明'] + EDIT, rule_rows, {'规则key': 32, '规则名称': 45, '项目法条依据': 85, '项目驳回原因提示': 80, '项目原审核说明': 75, '审核意见或修改后内容': 75}, editable=EDIT, height=200)

params = DATA['tables']['rule_params']
sheet('规则参数', ['参数key', '当前值', '项目现有说明', '审核提示'] + EDIT, [[x['pkey'], x['pvalue'], x.get('note'), '技术参数不当然等于法定要求；请核查适用情形、单位与法源。是否实际参与判定见业务逻辑核查。'] + review_tail() for x in params], {'参数key': 34, '项目现有说明': 80, '审核提示': 65, '审核意见或修改后内容': 65}, editable=EDIT, height=90)

templates = DATA['tables']['doc_templates']
latest = {k: max(t['version'] for t in templates if t['doc_key'] == k) for k in {t['doc_key'] for t in templates}}
tpl_rows = []
for x in templates:
    fn = f"文书原文/{x['doc_key']}-v{x['version']}.txt"
    body = plain(x['body'])
    (HERE / fn).write_text(body, encoding='utf-8')
    tpl_rows.append([f"TPL-{x['id']}", x['doc_key'], x['version'], x['title'], '是' if x['version'] == latest[x['doc_key']] else '否（历史）', body, fn, '模板为系统辅助草稿，是否采用官方制式表格及适用哪些事项请审核；占位符保持不变。', ''] + review_tail())
checks = (ROOT / 'src/services/checks.js').read_text()
m = re.search(r'async function objectionHtml\([^)]*\)\s*\{[\s\S]*?return `([\s\S]*?)`;', checks)
assert m, 'Objection template source not found'
objection = plain(m.group(1))
(HERE / '文书原文/objection-code-template.txt').write_text(objection, encoding='utf-8')
tpl_rows.append(['CODE-OBJ-01', 'objectionHtml', '代码模板', '数据异议与更正函', '是（代码生成）', objection, '文书原文/objection-code-template.txt', '来源src/services/checks.js；${...}为程序插值，未注入任何企业数据。本模板不存于doc_templates表。', ''] + review_tail())
ws = sheet('文书模板', ['模板ID', '文书key', '版本', '文书名称', '当前最新版本', '完整模板纯文本', '纯文本附件', '说明', '官方制式表格来源（填写）'] + EDIT, tpl_rows, {'文书名称': 32, '完整模板纯文本': 115, '纯文本附件': 46, '说明': 65, '审核意见或修改后内容': 85}, editable=['官方制式表格来源（填写）'] + EDIT, height=230)
for r in range(2, ws.max_row + 1):
    ws.cell(r, 7).hyperlink = ws.cell(r, 7).value

questions = [
    ['P0', '日期起算', 'src/services/rules.js:applyFrom', '当前行政处罚分支使用cases.listed_date加规则months；经营异常分支返回listed_date或当天。', '请明确公示日、决定日、义务履行日的适用关系；跨新旧规则如何选版本；月末与期限届满当日如何计算。'],
    ['P0', '严重情形细分', 'rule_versions / rules.evaluate', '同一serious等级命中统一规则；部分特殊情形以rejectReasons文字提示。', '请明确哪些情形须限制期限届满、哪些不允许提前申请，以及必须由系统阻断的条件。'],
    ['P0', '轻微信息无需申请', 'rules.evaluate / autoStopOnly', '规则带autoStopOnly，但evaluate仍运行前置条件检查并计算eligible。', '请审核无需申请、停止公示与可申请结论的边界，及应隐藏哪些材料与操作。'],
    ['P0', '经营异常前置条件', 'rules.evaluate / required_conditions', '三个条件在参数中统一配置；经营异常有移出日期时将履行义务视为满足，其余条件仍按配置核对。', '请分别列明未报年报、地址失联等情形的申请条件；已补报与已移出不可混同。'],
    ['P0', '分级与主体', 'rules.levelCheck / cases.level', '存在企业登记等级、罚款金额与裁量阶次一致性检查；代码仍保留severe展示枚举。', '请确认分级需要的完整事实、并处其他处罚、重点领域判断、名单与等级区分、自然人与企业金额口径。'],
    ['P0', '无新增同类判断', 'rule_params / rules.evaluate', 'no_similar_window_months=0；条件采用企业登记no_new_similar的三态值。', '请明确同一类违法行为范围、核查时间与证据要求；是否能跨事项类型复用。'],
    ['P0', '办理时限', 'definition.reviewDays / rule_params', '数据库同时存在规则版本天数和全局参数；事项页面展示参考期限。', '请核对受理、补正、核实、作出决定等不同起算点，工作日与自然日及停止计时条件。'],
    ['P0', '第三方异议期限', 'checks.objectionHtml / rule_params.objection_sla_days', '参数备注写答复时限3工作日；当前异议函正文写以适用规则及平台答复为准，不固定为3日。', '请区分法定异议期限、各平台承诺期限与企业自行设置提醒，核实能否提出及如何表述。'],
    ['P0', '材料与官方表格', 'definition.materials / doc_templates', '规则使用apply、subject、promise、rectify等材料代码；6类模板未证明来自官方制式表格。', '请逐项确认必要材料、份数、签章、适用条件及官方模板，填写材料要求补充表。'],
    ['P1', '数字凭证及扫码措辞', 'web/src/views/Verify.vue / src/services/cert.js', '核验页说明仅校验留存记录一致性，不替代官方修复证明，不作为征信报告、资信或投标资格证明。', '请审核名称与全文，明确向银行/招标方展示的边界、官方证明链接及避免误导所需信息。'],
    ['P1', '人工核录与渠道状态', 'src/services/checks.js / cert.js', '记录包含来源、核录时间和材料摘要；生成异议须非mock渠道冲突快照及官方材料。', '请核实人工登记能否作佐证、截图及官方结果需要哪些证据、数据更新后如何提示。'],
    ['P1', '数据处理与授权', '数据库结构：evidence_files / org_enterprises / purpose_shares', '平台涉及企业附件、机构授权和用途分享。本次未导出这些表的业务记录。', '请核查授权范围、敏感个人信息、公开扫码披露、保存期限、撤回删除与隐私文件需要补齐哪些内容。'],
    ['P1', '地方条例版本与适用', '法规总表 / 条款摘录', '53份文件均待核实；5份DOC需转格式，可能有同名旧版。', '请优先确认湖南及演示事项的适用规范，再补其他地区；逐份说明效力和替代关系。'],
]
sheet('业务逻辑核查', ['核查ID', '优先级', '核查主题', '系统位置', '当前实现事实（非法律意见）', '请法学院确认的问题'] + EDIT, [[f'CHECK-{i:02d}'] + r + review_tail() for i, r in enumerate(questions, 1)], {'当前实现事实（非法律意见）': 75, '请法学院确认的问题': 85, '审核意见或修改后内容': 75, '系统位置': 48}, editable=EDIT, height=110)

material_names = [('apply', '信用修复申请书'), ('subject', '申请人主体资格文件'), ('promise', '守信承诺书'), ('rectify', '整改情况说明及证明'), ('auth', '授权委托书'), ('list', '材料目录与证明清单'), ('plan', '整改计划书'), ('additional-1', '其他材料（请补充）'), ('additional-2', '其他材料（请补充）')]
mh = ['材料代码', '项目参考名称', '适用事项（填写）', '必要或可选（填写）', '份数（填写）', '签章与形式要求（填写）', '材料名称修订（填写）', '官方表格链接与条款（填写）'] + EDIT
sheet('材料要求补充', mh, [[k, n, '', '', '', '', '', ''] + review_tail() for k, n in material_names], {'项目参考名称': 40, '签章与形式要求（填写）': 55, '官方表格链接与条款（填写）': 65, '审核意见或修改后内容': 65}, editable=mh[2:], height=90)

purposes = {
    'knowledge_entries': '前端合规知识库条目；本次主审表', 'rule_versions': '有版本的诊断规则；本次主审表', 'rule_params': '规则与展示参数；本次主审表', 'doc_templates': '版本化文书模板；本次主审表',
    'kb_articles': '旧版知识文章表，请与knowledge_entries区分', 'cases': '企业失信事项、事实及办理状态', 'enterprises': '企业档案', 'users': '用户账号', 'sessions': '登录会话', 'orgs': '机构档案', 'org_members': '机构成员', 'org_enterprises': '机构获企业协作授权', 'enterprise_members': '企业成员权限',
    'case_channels': '各渠道公示状态', 'channel_snapshots': '渠道核查快照', 'checks_runs': '核查执行记录', 'diagnoses': '诊断结果', 'diagnosis_snapshots': '诊断结果快照', 'case_docs': '企业事项文书', 'doc_checks': '文书检查结果', 'tasks': '办理待办任务', 'task_events': '任务变更留痕', 'timeline_events': '事项时间线', 'stage_events': '办理阶段变更',
    'objections': '数据异议函', 'objection_events': '异议进度记录', 'objection_revisions': '异议文书历史版本', 'objection_followups': '异议跟进提醒', 'certificates': '辅助数字记录元信息', 'cert_scans': '核验访问记录', 'certificate_snapshots': '数字记录内容快照',
    'policies': '政策数据', 'alerts': '风险提醒', 'subscriptions': '订阅', 'usage_logs': '使用记录', 'audit_logs': '操作审计', 'evidence_files': '企业上传证明附件', 'doc_versions': '事项文书历史', 'channel_configs': '渠道配置', 'scheduled_jobs': '定时任务', 'compliance_subscriptions': '合规订阅', 'compliance_notices': '合规通知', 'notice_receipts': '通知已读记录', 'purpose_shares': '用途分享链接',
}
table_counts = Counter(x['TABLE_NAME'] for x in DATA['columns'])
sheet('数据表目录', ['数据库表名', '用途说明（技术组整理）', '字段数', '本包导出业务内容'], [[x['TABLE_NAME'], purposes.get(x['TABLE_NAME'], x.get('TABLE_COMMENT') or '见字段字典'), table_counts[x['TABLE_NAME']], '是，仅公共规则/模板内容' if x['TABLE_NAME'] in DATA['tables'] else '否，仅列结构'] for x in DATA['schema_tables']], {'数据库表名': 34, '用途说明（技术组整理）': 65, '本包导出业务内容': 45}, height=38)
sheet('字段字典', ['数据库表名', '字段名', '数据类型', '允许空值', '默认值', '键标记', '额外属性', '数据库原注释'], [[x['TABLE_NAME'], x['COLUMN_NAME'], x['COLUMN_TYPE'], x['IS_NULLABLE'], x['COLUMN_DEFAULT'], x['COLUMN_KEY'], x['EXTRA'], x['COLUMN_COMMENT']] for x in DATA['columns']], {'数据库表名': 34, '字段名': 30, '数据类型': 48, '默认值': 35, '数据库原注释': 65}, height=32)

WB.save(OUT)
check = load_workbook(OUT)
assert len(check['法规总表']['A']) - 1 == 53
assert check['当前知识库'].max_row - 1 == len(knowledge) == 18
assert check['诊断规则'].max_row - 1 == len(rules) == 5
assert check['文书模板'].max_row - 1 == len(templates) + 1 == 12
assert check['字段字典'].max_row - 1 == len(DATA['columns']) == 359
assert sum(x['extraction_status'] == 'failed' for x in INV['documents']) == 5
for ws in check:
    assert ws.max_column == len(list(ws.values)[0])
    for row in ws:
        for c in row:
            assert c.data_type not in ('f', 'e'), (ws.title, c.coordinate, c.value)
    headers = [c.value for c in ws[1]]
    if '本次审核结论' in headers and ws.title != '填写示例':
        col = headers.index('本次审核结论') + 1
        assert all(ws.cell(r, col).value == '待审核' for r in range(2, ws.max_row + 1))

shutil.copytree(ROOT / 'docs/credit-regulations/extracts', HERE / 'extracts', dirs_exist_ok=True)
shutil.copy2('/home/simon/信用条例.zip', HERE / '原始资料-信用条例.zip')
report = {'generated_at': NOW, 'source': DATA['scope'], 'sheets': COUNTS, 'all_review_states_pending': True, 'formula_count': 0, 'formula_errors': 0, 'exported_business_tables': list(DATA['tables']), 'no_enterprise_or_account_records': True}
(HERE / 'data/validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
readme = '''# 信复通法学院人工审核包

请先打开“信复通-法学院人工审核表.xlsx”的“使用说明”页。浅黄色列为填写区，可筛选、分工审核。

## 内容及来源
- 53份用户提供的信用条例：49核心候选、2背景、2其他主题，分类仅供初筛；48份提取正文在extracts，5份旧DOC需要另存DOCX后补充。
- 本地隔离演示数据库实际只读快照：18条知识、5条规则、12参数、11版文书（6类），并附代码生成异议函草稿。不是公网业务数据库的导出。
- 数据库44张表、359字段的结构字典和SQL快照，仅供技术对应；没有导出企业档案、账号、会话、附件等业务记录。
- 每条均留审核结论、意见、审核人和日期，默认待审核。项目旧reviewed标记不代表法学院已审。
- 未重新核验官方链接和法律效力；请核对官方全文、版本、适用范围。Excel修改不会自动写回数据库。

## 文件
- 信复通-法学院人工审核表.xlsx：主工作表，12个页签。
- 原始资料-信用条例.zip：用户原压缩包的未改动副本。
- extracts/：48份正文提取文本；机器条款摘录不替代全文。
- 文书原文/：11版模板及代码异议函草稿纯文本，无具体企业数据。
- data/review-snapshot.json：四张公共内容表的原始导出，便于技术组对应修改；模板保留HTML原文。
- data/数据库结构快照.sql：结构，不含数据插入语句。无需执行SQL才能审核。
- data/validation.json：表格核对结果。
- build_review.py：依据现有快照重建表格，交回填写后不要重新运行覆盖审核文件。

## 建议审核顺序
1. 诊断规则、业务逻辑核查、材料要求补充、最新文书模板。
2. 当前知识库；全国条例先湖南及演示事项所属领域，再扩展其他地区。
3. 每条填写具体法源、条号、修改文本和审核结论，保持ID/key/版本不变。另附需要采用的官方表格。
4. 交回填写后的xlsx与新增附件，由技术组逐项落实并验证；本包不自动入库，不代表法规已获认可。

当前内容的法律结论全部待本次人工确认。日期和旧文档中的开发判断不能直接作为法学院意见。
'''
assert len(check.sheetnames) == 12
(HERE / 'README.md').write_text(readme)
bundle = HERE.parent / '信复通-法学院人工审核包.zip'
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(HERE.rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts:
            z.write(p, Path('信复通-法学院人工审核包') / p.relative_to(HERE))
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
print(json.dumps({'workbook': str(OUT), 'bundle': str(bundle), 'validation': report}, ensure_ascii=False, indent=2))
