"""Validate and package existing research files; no database or network access."""

import hashlib
import json
import os
import tempfile
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT.parent / '信复通-法学院人工审核包.zip'
REPORT = ROOT / '联网核查结果与待确认事项-2026-11-03.md'
REMOVED = ('信复通-法学院人工审核表.xlsx', '信复通-法学院首轮审核版.xlsx')
EXPECTED = {'knowledge_entries': 18, 'rule_versions': 5,
            'doc_templates': 11, 'rule_params': 12}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_zip(files):
    descriptor, temporary = tempfile.mkstemp(prefix='.legal-review-', suffix='.zip',
                                             dir=BUNDLE.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                archive.write(path, Path(ROOT.name) / path.relative_to(ROOT))
        with zipfile.ZipFile(temporary) as archive:
            require(archive.testzip() is None, 'ZIP CRC检查失败')
            names = archive.namelist()
            require(len(names) == len(set(names)) == len(files), 'ZIP成员数量不一致')
            require(f'{ROOT.name}/{REPORT.name}' in names, 'ZIP缺少新报告')
            require(not any(name.endswith('.xlsx') for name in names), 'ZIP仍含旧Excel')
            require(archive.read(f'{ROOT.name}/{REPORT.name}') == REPORT.read_bytes(),
                    'ZIP报告与原文件不一致')
        os.replace(temporary, BUNDLE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    require(REPORT.is_file(), '缺少核查报告')
    require(not any(p.name in REMOVED for p in ROOT.rglob('*')), '已删除Excel被重新生成')
    snapshot = json.loads((ROOT / 'data/review-snapshot.json').read_text())
    tables = snapshot['tables']
    require(set(tables) == set(EXPECTED), '快照公共内容表范围改变')
    counts = {name: len(rows) for name, rows in tables.items()}
    require(counts == EXPECTED, f'快照条目数改变：{counts}')
    require(len(snapshot['schema_tables']) == 44 and len(snapshot['columns']) == 359,
            '结构快照数量改变')
    latest = {}
    for row in tables['doc_templates']:
        latest[row['doc_key']] = max(latest.get(row['doc_key'], 0), row['version'])
    require(len(latest) == 6 and set(latest.values()) == {2}, '最新模板版本改变')
    report = REPORT.read_text()
    for row in tables['rule_versions']:
        require(row['rule_key'] in report, f'报告漏列规则：{row["rule_key"]}')
    for row in tables['rule_params']:
        require(row['pkey'] in report, f'报告漏列参数：{row["pkey"]}')

    sources = json.loads((ROOT / 'online/sources.json').read_text())
    require(len(sources) == 34, '来源数量改变，请重新核对报告')
    require(len({row['id'] for row in sources}) == len(sources), '来源ID重复')
    saved_count = 0
    for row in sources:
        for saved in row['saved_files']:
            path = (ROOT / 'online' / saved['path']).resolve()
            require(path.is_relative_to((ROOT / 'online').resolve()), '非法来源文件路径')
            require(path.is_file(), f'缺少来源文件：{path.name}')
            require(path.stat().st_size == saved['bytes'] and digest(path) == saved['sha256'],
                    f'来源文件完整性检查失败：{path.name}')
            saved_count += 1

    retained = ROOT / '原始资料-信用条例.zip'
    raw_hash = digest(retained)
    original = Path('/home/simon/信用条例.zip')
    original_matches = digest(original) == raw_hash if original.is_file() else None
    require(original_matches is not False, '原始资料副本与用户文件不一致')
    validation_path = ROOT / 'data/online-review-validation.json'
    validation = {
        'generated_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
        'scope': '只读核查已有公开内容快照和本地资料；未连接业务数据库或公网服务器',
        'snapshot_counts': counts,
        'schema_tables': 44,
        'schema_columns': 359,
        'latest_template_versions': latest,
        'sources_total': len(sources),
        'sources_body_used_for_report': sum(bool(s['body_used_for_report']) for s in sources),
        'source_verification_counts': dict(Counter(s['verification'] for s in sources)),
        'source_saved_files_hash_verified': saved_count,
        'original_archive_sha256': raw_hash,
        'original_archive_matches_user_file': original_matches,
        'removed_excel_absent': list(REMOVED),
        'exported_tables': list(tables),
        'zip_crc_and_contents_verified': False,
        'business_database_written': False,
        'application_code_changed_by_packager': False,
        'legal_code_fixes_implemented': False,
    }
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    files = sorted(path for path in ROOT.rglob('*') if path.is_file()
                   and '__pycache__' not in path.parts and path.suffix != '.pyc')
    require(not any(path.is_symlink() for path in files), '资料目录不允许符号链接')
    require(not any(path.suffix == '.xlsx' for path in files), '资料目录仍有Excel')
    build_zip(files)
    validation['zip_crc_and_contents_verified'] = True
    validation['zip_members'] = len(files)
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    build_zip(files)
    print(json.dumps({'bundle': str(BUNDLE), 'members': len(files),
                      'sha256': digest(BUNDLE), 'validation': validation},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
