"""只读分析用户的法规压缩包，输出待复核资料，不连接平台数据库。"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET


def inspect(archive, destination, antiword=None, antiword_home=None):
    destination.mkdir(parents=True, exist_ok=True)
    texts = destination / 'extracts'
    texts.mkdir(exist_ok=True)
    records = []
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(archive) as source, tempfile.TemporaryDirectory() as scratch:
        entries = source.infolist()
        if sum(info.file_size for info in entries) > 50 * 1024 * 1024:
            raise ValueError('解压后体积超出本次资料分析限制')
        for index, info in enumerate(entries, 1):
            if info.is_dir():
                continue
            name = info.filename
            if not info.flag_bits & 0x800:
                try:
                    name = name.encode('cp437').decode('gbk')
                except UnicodeError:
                    pass
            suffix = Path(name).suffix.lower()
            if suffix not in ('.doc', '.docx'):
                continue
            raw = source.read(info)
            title = Path(name).stem.split('_')[0]
            text, error = '', None
            try:
                if suffix == '.docx':
                    import io
                    with zipfile.ZipFile(io.BytesIO(raw)) as doc:
                        root = ET.fromstring(doc.read('word/document.xml'))
                        text = '\n'.join(''.join(
                            t.text or '' for t in p.findall('.//w:t', ns)
                        ) for p in root.findall('.//w:p', ns))
                elif antiword:
                    local = Path(scratch) / f'{index}.doc'
                    local.write_bytes(raw)
                    env = dict(os.environ)
                    if antiword_home:
                        env['ANTIWORDHOME'] = antiword_home
                    result = subprocess.run([antiword, '-m', 'UTF-8.txt', str(local)],
                                            capture_output=True, timeout=20, env=env)
                    if result.returncode:
                        raise ValueError(result.stderr.decode('utf-8', errors='replace'))
                    text = result.stdout.decode('utf-8')
                else:
                    raise ValueError('未配置旧版 DOC 读取器')
            except (ValueError, OSError, UnicodeError, ET.ParseError, zipfile.BadZipFile, subprocess.TimeoutExpired) as exc:
                error = str(exc)
            text = re.sub(r'\n[ \t]*\n+', '\n\n', text).strip()
            relevance = '核心候选'
            if '信用证' in title or '出口信用保险' in title:
                relevance = '排除：其他法律主题'
            elif '二线口岸' in title or '关于加强信用建设的决定' in title:
                relevance = '补充背景资料'
            locality = re.match(r'^(.+?(?:自治区|特别行政区|省|市|经济特区|自由贸易港))', title)
            topics = [word for word in ['信用修复', '异议', '失信惩戒', '信息更正', '权益保护', '信息主体', '信用服务', '招标', '融资'] if word in text]
            # 文件名后缀只作为资料标签；不是生效日期，也不是有效性证明。
            date_tag = re.search(r'_(\d{8})(?:\.[^.]+)$', name)
            effective_sentences = re.findall(r'[^\n。]{0,60}自[^\n。]{0,55}施行[^\n。]{0,40}', text)
            extract_name = f'{index:02d}-{title}.txt' if text else None
            if extract_name:
                (texts / extract_name).write_text(text, encoding='utf-8')
            snippets = [p.strip() for p in text.splitlines() if ('信用修复' in p or '异议' in p)][:8]
            records.append(dict(id=index, filename=name, title=title, format=suffix[1:],
                                bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                                locality=locality.group(1) if locality else None,
                                filename_date_tag=date_tag.group(1) if date_tag else None,
                                review_status='unverified', source_url=None,
                                applicability=relevance, topics=topics,
                                extraction_status='ok' if text else 'failed', extraction_error=error,
                                text_characters=len(text), text_file=f'extracts/{extract_name}' if extract_name else None,
                                effective_date_clues=effective_sentences, relevant_snippets=snippets))
    manifest = dict(source_archive=str(archive.resolve()),
                    archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                    total=len(records), format_counts=dict(Counter(r['format'] for r in records)),
                    applicability_counts=dict(Counter(r['applicability'] for r in records)),
                    extraction_counts=dict(Counter(r['extraction_status'] for r in records)),
                    documents=records)
    (destination / 'inventory.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in manifest.items() if key != 'documents'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--antiword')
    parser.add_argument('--antiword-home')
    args = parser.parse_args()
    inspect(args.archive, args.out, args.antiword, args.antiword_home)
