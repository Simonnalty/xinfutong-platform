#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把一份中文法律文书（HTML 片段）渲染成真实的 PDF 文件。
输入：stdin 上的 JSON
  { "title": "...", "html": "<h4>...</h4><p>...</p>", "docNo": "XF-...",
    "footer": "信复通", "seal": false }
输出：stdout 上的 PDF 二进制
"""
import sys, json, re, os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                Table, TableStyle, Flowable)

_HERE = os.path.dirname(os.path.abspath(__file__))
_LOCAL = os.path.join(_HERE, 'fonts')
FONT_DIR = os.environ.get('XFT_FONT_DIR') or (
    _LOCAL if os.path.isdir(_LOCAL) else '/home/simon/.local/share/fonts/win-zh')

def _font(name, file, idx=0, sub=None):
    path = os.path.join(FONT_DIR, file)
    if not os.path.exists(path):
        return False
    try:
        if sub is not None:
            f = TTFont(name, path, subfontIndex=sub)
        else:
            f = TTFont(name, path)
        pdfmetrics.registerFont(f)
        return True
    except Exception:
        return False

HAVE_HEI = _font('Hei', 'simhei.ttf')
HAVE_SONG = _font('Song', 'simsun.ttc', sub=0)
HAVE_KAI = _font('Kai', 'simkai.ttf')

BODY_FONT = 'Song' if HAVE_SONG else ('Hei' if HAVE_HEI else 'Helvetica')
TITLE_FONT = 'Hei' if HAVE_HEI else BODY_FONT

INK = colors.HexColor('#0F2A44')
SUB = colors.HexColor('#6E7A89')
LINE = colors.HexColor('#D8D2C6')
RED = colors.HexColor('#B03A2E')


def styles():
    return {
        'title': ParagraphStyle('title', fontName=TITLE_FONT, fontSize=19, leading=28,
                                alignment=TA_CENTER, textColor=INK, spaceAfter=4),
        'meta': ParagraphStyle('meta', fontName=BODY_FONT, fontSize=10, leading=16,
                               alignment=TA_CENTER, textColor=SUB, spaceAfter=14),
        'h': ParagraphStyle('h', fontName=TITLE_FONT, fontSize=14, leading=22,
                            alignment=TA_CENTER, textColor=INK,
                            spaceBefore=2, spaceAfter=10),
        'body': ParagraphStyle('body', fontName=BODY_FONT, fontSize=12, leading=23,
                               alignment=TA_JUSTIFY, textColor=colors.black,
                               firstLineIndent=24, spaceAfter=8, wordWrap='CJK'),
        'plain': ParagraphStyle('plain', fontName=BODY_FONT, fontSize=12, leading=23,
                                alignment=TA_LEFT, textColor=colors.black,
                                firstLineIndent=0, spaceAfter=8, wordWrap='CJK'),
        'sign': ParagraphStyle('sign', fontName=BODY_FONT, fontSize=12, leading=26,
                               alignment=TA_RIGHT, textColor=colors.black,
                               spaceBefore=22, wordWrap='CJK'),
    }


class Rule(Flowable):
    """正文与落款之间的细分隔线"""
    def __init__(self, width):
        Flowable.__init__(self)
        self.width = width

    def wrap(self, aw, ah):
        return (aw, 10)

    def draw(self):
        c = self.canv
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(0, 4, self.width, 4)


class Seal(Flowable):
    """红色圆形印章（仅用于平台出具的凭证）"""
    def __init__(self, size=96, top='信复通', bottom='信用修复专用章'):
        Flowable.__init__(self)
        self.size, self.top, self.bottom = size, top, bottom

    def wrap(self, aw, ah):
        return (self.size, self.size + 8)

    def draw(self):
        c = self.canv
        s = self.size
        c.saveState()
        c.translate(s / 2, s / 2)
        c.setStrokeColor(RED)
        c.setFillColor(RED)
        c.setLineWidth(2.2)
        c.circle(0, 0, s / 2 - 3, stroke=1, fill=0)
        c.setLineWidth(0.8)
        c.circle(0, 0, s / 2 - 8, stroke=1, fill=0)
        c.setFont(TITLE_FONT, 13)
        c.drawCentredString(0, s * 0.14, self.top)
        c.setFont(BODY_FONT, 8)
        text = self.bottom
        c.setFont(BODY_FONT, 7.6)
        c.drawCentredString(0, -s * 0.02, text[:6])
        c.drawCentredString(0, -s * 0.15, text[6:] or '')
        c.setFont(BODY_FONT, 7)
        c.drawCentredString(0, -s * 0.30, '电子核验')
        c.restoreState()


TAG_RE = re.compile(r'<(h4|p|div)\b([^>]*)>(.*?)</\1>', re.S)


def clean_inline(s):
    s = re.sub(r'<span class="lock">(.*?)</span>', r'<b>\1</b>', s, flags=re.S)
    s = s.replace('<br>', '<br/>').replace('<br />', '<br/>')
    # 只保留 reportlab 认识的标签
    s = re.sub(r'</?(div|span|h4|p)\b[^>]*>', '', s)
    s = re.sub(r'<(?!b>|/b>|i>|/i>|u>|/u>|br/>)', '&lt;', s)
    return s.strip()


def build(data, out):
    st = styles()
    doc_no = data.get('docNo', '')
    footer = data.get('footer', '信用修复材料')

    def on_page(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFont(BODY_FONT, 8.5)
        canvas.setFillColor(SUB)
        canvas.drawString(24 * mm, 15 * mm, footer + ('　·　编号 ' + doc_no if doc_no else ''))
        canvas.drawRightString(w - 24 * mm, 15 * mm, '第 %d 页' % doc.page)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(24 * mm, 19 * mm, w - 24 * mm, 19 * mm)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        out, pagesize=A4,
        leftMargin=26 * mm, rightMargin=26 * mm,
        topMargin=25 * mm, bottomMargin=24 * mm,
        title=data.get('title', '信用修复材料'),
        author='信复通', creator='信复通 · 信用修复 SaaS',
    )

    flow = []
    if data.get('title'):
        flow.append(Paragraph(clean_inline(data['title']), st['title']))
        if data.get('subtitle'):
            flow.append(Paragraph(clean_inline(data['subtitle']), st['meta']))

    html = data.get('html', '')
    for tag, attrs, inner in TAG_RE.findall(html):
        cls = re.search(r'class="([^"]*)"', attrs)
        cls = cls.group(1) if cls else ''
        if tag == 'h4':
            flow.append(Paragraph(clean_inline(inner), st['h']))
        elif tag == 'div' and 'meta' in cls:
            flow.append(Paragraph(clean_inline(inner), st['meta']))
        elif tag == 'div' and 'sign' in cls:
            flow.append(Rule(doc.width))
            flow.append(Paragraph(clean_inline(inner), st['sign']))
        else:
            style = st['plain'] if 'no-indent' in cls else st['body']
            txt = clean_inline(inner)
            if txt:
                flow.append(Paragraph(txt, style))

    if data.get('seal'):
        flow.append(Spacer(1, 10))
        t = Table([[Seal()]], colWidths=[doc.width])
        t.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
                               ('LEFTPADDING', (0, 0), (-1, -1), 0),
                               ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
        flow.append(t)

    doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)


def main():
    raw = sys.stdin.buffer.read().decode('utf-8')
    data = json.loads(raw)
    out = sys.stdout.buffer
    build(data, out)
    out.flush()


if __name__ == '__main__':
    main()
