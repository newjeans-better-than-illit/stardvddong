#!/usr/bin/env python3
"""스타듀 똥밸리 단일 파일 번들러.

index.html 이 읽는 CSS·JS 를 순서대로 모두 인라인하고, CSS 안의 폰트(url(...))는
data URI 로 바꿔 dist/stardew-ddong.html 하나로 만든다.
아티팩트용이므로 <!doctype>/<html>/<head>/<body> 태그 없이 <title> 로 시작한다.

사용: python3 tools/bundle.py
"""
import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'dist')
OUT = os.path.join(OUT_DIR, 'stardew-ddong.html')
TITLE = '스타듀 똥밸리'
MIME = {'.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png'}


def read(path):
    with open(os.path.join(ROOT, path), 'r', encoding='utf-8') as f:
        return f.read()


def inline_css(css, base_dir):
    def repl(m):
        url = m.group(2)
        if url.startswith('data:') or re.match(r'^[a-z]+://', url):
            return m.group(0)
        p = os.path.normpath(os.path.join(base_dir, url))
        ext = os.path.splitext(p)[1].lower()
        with open(os.path.join(ROOT, p), 'rb') as f:
            data = base64.b64encode(f.read()).decode('ascii')
        return "url('data:%s;base64,%s')" % (MIME.get(ext, 'application/octet-stream'), data)
    return re.sub(r"url\((['\"]?)([^'\")]+)\1\)", repl, css)


def main():
    html = read('index.html')
    styles = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    scripts = re.findall(r'<script[^>]+src="([^"]+)"[^>]*></script>', html)
    m = re.search(r'<body[^>]*>(.*?)<script', html, re.S)
    body = m.group(1).strip() if m else ''
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S).strip()
    parts = ['<title>%s</title>' % TITLE,
             '<meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">']
    for href in styles:
        css = inline_css(read(href), os.path.dirname(href))
        parts.append('<style>\n%s\n</style>' % css)
    parts.append(body)
    total_js = 0
    for src in scripts:
        js = read(src)
        if re.search(r'</script', js, re.I):
            sys.exit('오류: %s 안에 </script 문자열이 있습니다 (번들이 깨집니다)' % src)
        if re.search(r'\bfetch\s*\(', js):
            print('경고: %s 에 fetch( 가 있습니다 — 단일 파일에서는 런타임 fetch 를 쓰면 안 됩니다' % src)
        total_js += len(js)
        parts.append('<script>/* %s */\n%s\n</script>' % (src, js))
    os.makedirs(OUT_DIR, exist_ok=True)
    out = '\n'.join(parts) + '\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(out)
    print('%s 생성: %.1f KB (스크립트 %d개, JS %.1f KB, CSS %d개)' % (os.path.relpath(OUT, ROOT), len(out.encode('utf-8')) / 1024, len(scripts), total_js / 1024, len(styles)))


if __name__ == '__main__':
    main()
