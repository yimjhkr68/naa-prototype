#!/usr/bin/env python3
"""데이터 검증과 묶음 파일 생성

- data/*.json 사이의 참조(세션·주제·사건·지명·인물·언급·대표 인용)가 모두 이어지는지 검사함
- 세그먼트의 persons[]를 확정 언급(공인)에서 다시 계산하여 되써 넣음
- 파일을 더블클릭해 열 때(file://)를 위해 data/bundle.js를 만듦. 서버로 열면 JSON을 직접 읽음

실행: python3 tools/build_bundle.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OH = os.path.join(ROOT, "contents", "oral-history")  # 구술기록 페이지 폴더(데이터·매체·내려받기)
DATA = os.path.join(OH, "data")
FILES = ["site", "narrators", "sessions", "segments", "topics", "assemblies", "places", "persons", "mentions"]


def load(n):
    with open(os.path.join(DATA, n + ".json"), encoding="utf-8") as f:
        return json.load(f)


def main():
    d = {n: load(n) for n in FILES}
    errs = []
    nar = {n["id"]: n for n in d["narrators"]}
    ses = {s["id"]: s for s in d["sessions"]}
    seg = {s["id"]: s for s in d["segments"]}
    para = {p["id"]: (s, p) for s in d["segments"] for p in s["transcript_sync"]}
    topics = {t["id"] for t in d["topics"]["topics"]}
    events = {e["id"] for e in d["topics"]["events"]}
    places = {p["place_id"]: p for p in d["places"]}
    persons = {p["person_id"]: p for p in d["persons"]}

    for s in d["sessions"]:
        if s["narrator_id"] not in nar:
            errs.append("세션 %s: 구술자 없음" % s["id"])
    for s in d["segments"]:
        if s["session_id"] not in ses:
            errs.append("세그먼트 %s: 세션 없음" % s["id"])
        for t in s["topics"]:
            if t not in topics:
                errs.append("세그먼트 %s: 주제 %s 없음" % (s["id"], t))
        for e in s["events"]:
            if e not in events:
                errs.append("세그먼트 %s: 사건 %s 없음" % (s["id"], e))
        if s["access_level"] != "onsite" and not s["start_tc"]:
            errs.append("세그먼트 %s: 타임코드 없음(build_media.py를 먼저 실행)" % s["id"])
        if s["access_level"] == "onsite" and s["transcript_sync"]:
            errs.append("세그먼트 %s: 방문 열람 구간의 녹취문이 공개 데이터에 들어 있음" % s["id"])
    for m in d["mentions"]:
        if m["paragraph_id"] not in para:
            errs.append("언급 %s: 문단 없음" % m["mention_id"])
            continue
        s, p = para[m["paragraph_id"]]
        if s["id"] != m["segment_id"]:
            errs.append("언급 %s: 세그먼트 불일치" % m["mention_id"])
        if m["surface"] not in p["text"]:
            errs.append("언급 %s: 표기 '%s'가 문단에 없음" % (m["mention_id"], m["surface"]))
        pool = places if m["entity_type"] == "PLACE" else persons
        if m["entity_id"] not in pool:
            errs.append("언급 %s: 사전 항목 %s 없음" % (m["mention_id"], m["entity_id"]))
    for n in d["narrators"]:
        if n["person_id"] not in persons:
            errs.append("구술자 %s: 인명 사전 항목 없음" % n["id"])
        for q in n["representative_quotes"]:
            if q["segment_id"] not in seg or q["paragraph_id"] not in para:
                errs.append("구술자 %s: 대표 인용 출처 없음" % n["id"])
            elif q["text"] not in para[q["paragraph_id"]][1]["text"]:
                errs.append("구술자 %s: 대표 인용문이 녹취문과 다름" % n["id"])
    for s in d["sessions"]:
        if s.get("status") not in ("online", "onsite", "processing"):
            errs.append("세션 %s: status 값 오류" % s["id"])
    for s in d["segments"]:
        for p in s["transcript_sync"]:
            if "text_en" in p and not p["text_en"].strip():
                errs.append("문단 %s: 빈 번역" % p["id"])
    for sid in d["site"]["home"]["featured_segments"]:
        if sid not in seg:
            errs.append("오늘의 증언 %s 없음" % sid)

    if errs:
        print("검증 실패 %d건" % len(errs))
        for e in errs:
            print(" -", e)
        sys.exit(1)

    # 세그먼트 persons[] 재계산 — 확정 상태이고 공인인 인물만
    for s in d["segments"]:
        ids = []
        for m in d["mentions"]:
            if m["segment_id"] == s["id"] and m["entity_type"] == "PERSON" and m["status"] == "CONFIRMED":
                if persons[m["entity_id"]]["is_public_figure"] and m["entity_id"] not in ids:
                    ids.append(m["entity_id"])
        s["persons"] = ids
    with open(os.path.join(DATA, "segments.json"), "w", encoding="utf-8") as f:
        json.dump(d["segments"], f, ensure_ascii=False, indent=2)
        f.write("\n")

    with open(os.path.join(DATA, "bundle.js"), "w", encoding="utf-8") as f:
        f.write("/* 자동 생성 파일 — data/*.json을 수정한 뒤 tools/build_bundle.py로 다시 만듦 */\n")
        f.write("window.OH_DATA = ")
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("검증 통과 · 세그먼트 %d · 언급 %d · bundle.js 생성" % (len(d["segments"]), len(d["mentions"])))


if __name__ == "__main__":
    main()
