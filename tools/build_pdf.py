#!/usr/bin/env python3
"""색인 포함 전문 PDF(Full Transcript with Index) 표본 생성 — 미국 상원 구술사 방식

타임코드 동기 녹취문(작업 1)과 세그먼트 색인·인명/지명 사전(작업 4·13·14) 데이터로 자동 조판함.
색인 번호는 쪽수 대신 '회차-세그먼트' 번호와 타임코드를 씀(영상과 함께 찾아볼 수 있게).

실행: python3 tools/build_pdf.py [구술자ID]   (기본 n01)
"""
import json, os, sys, html, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OH = os.path.join(ROOT, "contents", "oral-history")  # 구술기록 페이지 폴더(데이터·매체·내려받기)
DATA = os.path.join(OH, "data")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def load(n):
    with open(os.path.join(DATA, n + ".json"), encoding="utf-8") as f:
        return json.load(f)


def sec(tc):
    h, m, s = tc.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def clk(tc):
    t = int(sec(tc))
    return "%02d:%02d:%02d" % (t // 3600, t % 3600 // 60, t % 60)


def date_k(d):
    y, m, dd = d.split("-")
    return "%s. %d. %d." % (y, int(m), int(dd))


def main():
    nid = sys.argv[1] if len(sys.argv) > 1 else "n01"
    site, nars, sess, segs = load("site"), load("narrators"), load("sessions"), load("segments")
    topics, places, persons, mentions = load("topics"), load("places"), load("persons"), load("mentions")
    nar = [n for n in nars if n["id"] == nid][0]
    my_sess = sorted([s for s in sess if s["narrator_id"] == nid], key=lambda s: s["seq"])
    seg_by = {s["id"]: s for s in segs}
    place_by = {p["place_id"]: p for p in places}
    person_by = {p["person_id"]: p for p in persons}
    tlabel = {t["id"]: t["label"] for t in topics["topics"] + topics["events"]}
    ref = {}   # 세그먼트 → '1-3'
    body = []
    toc = []
    for s in my_sess:
        ss = sorted([g for g in segs if g["session_id"] == s["id"]], key=lambda g: g["seq"])
        body.append('<h2 class="ses">제%d차 채록 <small>%s · %s · 면담 %s</small></h2>' % (s["seq"], date_k(s["date"]), html.escape(s["place"]), html.escape(s["interviewer"])))
        toc.append('<li class="ts">제%d차 채록 — %s</li>' % (s["seq"], date_k(s["date"])))
        for g in ss:
            r = "%d-%d" % (s["seq"], g["seq"])
            ref[g["id"]] = r
            toc.append('<li><span>%s</span> %s <em>%s–%s</em></li>' % (r, html.escape(g["title"]), clk(g["start_tc"]), clk(g["end_tc"])))
            body.append('<h3 id="s%s"><span>%s</span>%s</h3><p class="rng">%s–%s · 주제: %s</p>' % (
                r, r, html.escape(g["title"]), clk(g["start_tc"]), clk(g["end_tc"]),
                ", ".join(tlabel[t] for t in g["topics"] + g["events"]) or "—"))
            if g["access_level"] == "onsite":
                body.append('<p class="onsite">[방문 열람 구간 — 녹취문은 국회기록원 열람실에서 제공]</p>')
                continue
            for p in g["transcript_sync"]:
                ivw = p["speaker"] != nar["name"]
                body.append('<p class="pa%s"><span class="tc">[%s]</span> <b>%s</b> %s</p>' % (
                    " ivw" if ivw else "", clk(p["tc"]), html.escape(p["speaker"] + (" (면담자)" if ivw else "")), html.escape(p["text"])))

    # 색인 — 확정되고 공개 가능한 언급만(사인·사적 장소 제외)
    def public(m):
        if m["status"] != "CONFIRMED" or m["segment_id"] not in ref:
            return False
        if seg_by[m["segment_id"]]["access_level"] == "onsite":
            return False
        e = place_by.get(m["entity_id"]) if m["entity_type"] == "PLACE" else person_by.get(m["entity_id"])
        return e and (e["is_public"] if m["entity_type"] == "PLACE" else e["is_public_figure"])

    idx = {"PERSON": {}, "PLACE": {}}
    for m in mentions:
        if public(m):
            idx[m["entity_type"]].setdefault(m["entity_id"], []).append("%s(%s)" % (ref[m["segment_id"]], clk(m["tc"])[3:]))
    tidx = {}
    for sid, r in ref.items():
        for t in seg_by[sid]["topics"] + seg_by[sid]["events"]:
            tidx.setdefault(tlabel[t], []).append(r)

    def block(title, rows):
        return '<section class="ix"><h2>%s</h2><dl>%s</dl></section>' % (title, "".join(
            '<dt>%s</dt><dd>%s</dd>' % (k, ", ".join(dict.fromkeys(v))) for k, v in sorted(rows, key=lambda x: x[0])))

    per_rows = [("%s <small>%s</small>" % (html.escape(person_by[k]["name"]), html.escape(person_by[k]["disambiguation"])), v) for k, v in idx["PERSON"].items()]
    pl_rows = [(html.escape(place_by[k]["name"]), v) for k, v in idx["PLACE"].items()]
    tp_rows = [(html.escape(k), v) for k, v in tidx.items()]
    total = sum(sec(s["duration"]) for s in my_sess)

    doc = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>%(name)s 구술 전문</title>
<style>
@page{size:A4; margin:22mm 20mm 22mm 22mm; @bottom-center{content:counter(page); font:9pt "Apple SD Gothic Neo",sans-serif; color:#888}
  @top-right{content:"%(name)s 구술 전문 · 표본"; font:8pt "Apple SD Gothic Neo",sans-serif; color:#aaa}}
@page :first{@bottom-center{content:none} @top-right{content:none}}
body{font-family:"AppleMyungjo","Nanum Myeongjo",serif; font-size:10.5pt; line-height:1.85; color:#17181A; word-break:keep-all}
.cover{height:245mm; display:flex; flex-direction:column; page-break-after:always}
.cover .org{font-family:"Apple SD Gothic Neo",sans-serif; font-size:10pt; letter-spacing:.2em; color:#004890}
.cover h1{font-size:34pt; margin:60mm 0 0; letter-spacing:-.03em}
.cover .sub{font-size:13pt; margin-top:6mm; color:#55585C}
.cover dl{margin-top:22mm; font-family:"Apple SD Gothic Neo",sans-serif; font-size:9.5pt; display:grid; grid-template-columns:28mm 1fr; gap:2mm 4mm}
.cover dt{color:#86898D} .cover dd{margin:0}
.cover .warn{margin-top:auto; border:1px solid #8A5A33; color:#8A5A33; padding:4mm 5mm; font-family:"Apple SD Gothic Neo",sans-serif; font-size:9pt}
h2{font-size:15pt; letter-spacing:-.03em; margin:0 0 5mm}
.guide{page-break-after:always; font-family:"Apple SD Gothic Neo",sans-serif; font-size:9.5pt}
.guide ul{padding-left:5mm} .guide li{margin-bottom:1.5mm}
.toc{list-style:none; padding:0; margin-top:8mm} .toc li{font-family:"Apple SD Gothic Neo",sans-serif; font-size:9.5pt; padding:1mm 0; border-bottom:.3pt solid #ddd}
.toc li span{display:inline-block; width:12mm; color:#004890} .toc li em{float:right; font-style:normal; color:#888}
.toc .ts{font-weight:700; border-bottom:.8pt solid #17181A; margin-top:4mm}
h2.ses{page-break-before:always; border-bottom:1pt solid #17181A; padding-bottom:2mm}
h2.ses small{font-size:9pt; font-weight:400; color:#86898D; font-family:"Apple SD Gothic Neo",sans-serif; margin-left:3mm}
h3{font-size:12pt; margin:8mm 0 1mm; letter-spacing:-.03em; page-break-after:avoid}
h3 span{font-family:"Apple SD Gothic Neo",sans-serif; font-size:9pt; color:#004890; margin-right:3mm}
.rng{font-family:"Apple SD Gothic Neo",sans-serif; font-size:8.5pt; color:#86898D; margin:0 0 3mm}
.pa{margin:0 0 2.5mm; text-align:justify} .pa.ivw{color:#55585C}
.pa b{font-family:"Apple SD Gothic Neo",sans-serif; font-size:9pt; margin-right:1mm}
.tc{font-family:"Apple SD Gothic Neo",sans-serif; font-size:8pt; color:#0090A8}
.onsite{color:#888; font-style:italic}
.ixwrap{page-break-before:always}
.ix{margin-bottom:8mm} .ix dl{columns:2; column-gap:10mm; font-family:"Apple SD Gothic Neo",sans-serif; font-size:9pt; margin:0}
.ix dt{font-weight:700; break-after:avoid} .ix dt small{font-weight:400; color:#86898D}
.ix dd{margin:0 0 2mm 3mm; color:#55585C; break-inside:avoid}
</style></head><body>
<section class="cover"><div class="org">국회기록원 구술기록 · 전문(全文)</div>
<h1>%(name)s 구술</h1><div class="sub">%(pos)s · 색인 포함 전문</div>
<dl><dt>채록 사업</dt><dd>%(project)s</dd><dt>채록</dt><dd>%(dates)s</dd><dt>면담자</dt><dd>%(ivw)s</dd><dt>분량</dt><dd>%(total)d분 · 세그먼트 %(nseg)d개</dd>
<dt>이용 조건</dt><dd>%(license)s</dd><dt>인용 형식</dt><dd>%(name)s 구술, 「세그먼트 제목」, 채록 회차, 타임코드, 국회기록원 소장.</dd></dl>
<div class="warn">표본 문서 — %(notice)s. 원장 보고용 프로토타입의 산출 형식을 보이기 위한 것으로, 실제 구술 내용이 아님.</div></section>
<section class="guide"><h2>일러두기</h2><ul>
<li>이 문서는 타임코드 동기 녹취문과 세그먼트 색인 데이터로 자동 조판하였다.</li>
<li>[시:분:초]는 해당 회차 원본 영상의 재생 위치다. 온라인 서비스의 세그먼트 주소에 시각을 붙이면 같은 대목으로 바로 이동한다.</li>
<li>'1-3'은 제1차 채록의 세 번째 세그먼트를 뜻한다. 색인의 번호는 쪽수 대신 세그먼트 번호와 언급 시각(분:초)을 적었다.</li>
<li>인명·지명 색인은 검수를 거쳐 확정된 연결만 싣는다. 사인(私人)과 사적 장소는 색인에서 제외하였다.</li>
</ul><h2 style="margin-top:10mm">차례</h2><ul class="toc">%(toc)s</ul></section>
%(body)s
<div class="ixwrap">%(ix)s</div>
</body></html>""" % {
        "name": html.escape(nar["name"]), "pos": html.escape(nar["headline_position"]),
        "project": html.escape(", ".join(dict.fromkeys(s["project_name"] for s in my_sess))),
        "dates": " / ".join("제%d차 %s" % (s["seq"], date_k(s["date"])) for s in my_sess),
        "ivw": html.escape(", ".join(dict.fromkeys(s["interviewer"] for s in my_sess))),
        "total": round(total / 60), "nseg": len(ref), "license": html.escape(site["license_default"]),
        "notice": html.escape(site["sample_notice"]), "toc": "".join(toc), "body": "\n".join(body),
        "ix": block("인명 색인", per_rows) + block("지명 색인", pl_rows) + block("주제·사건 색인", tp_rows)}

    os.makedirs(os.path.join(ROOT, "tools", "build"), exist_ok=True)
    src = os.path.join(ROOT, "tools", "build", "transcript_%s.html" % nid)
    with open(src, "w", encoding="utf-8") as f:
        f.write(doc)
    out = os.path.join(OH, "downloads", "%s-full-transcript-index.pdf" % nid)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf-no-header",
                    "--print-to-pdf=" + out, "file://" + src], capture_output=True)
    print("생성:", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
