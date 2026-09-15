#!/usr/bin/env python3
"""국회기록원 사이트 계층 페이지 생성

tools/naa_site.src.html(1차 과제 「국회기록원 아카이브」 화면 원본) 하나로
사이트 계층에 맞는 페이지를 만듦

    /                        국회기록원 첫 화면            index.html
    /collection/             국회의원 컬렉션               collection/index.html
    /contents/               기록콘텐츠                    contents/index.html
    /contents/oral-history/  구술기록(별도 코드, 이 스크립트 대상 아님)

  python3 tools/build_site.py                  # 위 세 페이지 생성
  python3 tools/build_site.py --single 경로    # 한 파일 시연본(claude.ai 게시용) 생성
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "naa_site.src.html")
SITE_URL = "https://yimjhkr68.github.io/naa-prototype/"
TITLE_TAG = "<title>국회기록원 아카이브</title>"

PAGES = [
    # 파일, 화면, 최상위까지의 상대 경로, 구술기록 경로, 제목
    ("index.html", "home", "", "contents/oral-history/", "국회기록원 아카이브"),
    ("collection/index.html", "collection", "../", "../contents/oral-history/", "국회의원 컬렉션 — 국회기록원 아카이브"),
    ("contents/index.html", "contents", "../", "oral-history/", "기록콘텐츠 — 국회기록원 아카이브"),
]

HEAD = """<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="googlebot" content="noindex,nofollow">
<title>%(title)s</title>
<link rel="icon" href="data:image/svg+xml,%%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%%3E%%3Ccircle cx='8' cy='8' r='7' fill='%%23004890'/%%3E%%3C/svg%%3E">
<style>:root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%%}[hidden]:not([hidden=until-found i]){display:none!important}</style>
<script>window.NAA = %(naa)s;</script>
</head><body>
<!-- 자동 생성 파일(tools/build_site.py). 고칠 때는 tools/naa_site.src.html을 고친 뒤 다시 생성함 -->
"""


def fill(src, home, coll, oh, ext):
    for k, v in (("{{HOME}}", home), ("{{COLL}}", coll), ("{{OH}}", oh), ("{{EXT}}", ext)):
        assert k in src, k
        src = src.replace(k, v)
    return src


def main():
    src = open(SRC, encoding="utf-8").read()
    assert src.count(TITLE_TAG) == 1
    if len(sys.argv) == 3 and sys.argv[1] == "--single":
        out = fill(src, "#", "#", SITE_URL + "contents/oral-history/", ' target="_blank" rel="noopener"')
        open(sys.argv[2], "w", encoding="utf-8").write(out)
        print("생성(한 파일 시연본):", sys.argv[2])
        return
    for path, page, root, oh, title in PAGES:
        body = fill(src.replace(TITLE_TAG, ""), root or "./", root + "collection/", oh, "")
        naa = json.dumps({"page": page, "root": root, "oh": oh, "ext": False}, ensure_ascii=False)
        out = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w", encoding="utf-8").write(HEAD % {"title": title, "naa": naa} + body + "</body></html>\n")
        print("생성:", path)


if __name__ == "__main__":
    main()
