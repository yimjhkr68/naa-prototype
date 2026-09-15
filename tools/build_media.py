#!/usr/bin/env python3
"""표본 영상 생성 — 녹취문(data/segments.json)을 합성 음성으로 읽어 세션별 영상을 만든다.

처리 순서
  1. 문단마다 합성 음성을 만들고 길이를 재어 타임코드를 계산함(ISMP 파이프라인의 '강제 정렬' 역할을 대신함)
  2. 세그먼트별 화면(프레임)을 크롬 헤드리스로 촬영함
  3. 세션 단위 원본 영상(mp4)과 WebVTT 자막을 만듦. 세그먼트는 원본 안의 가상 구간임(설계 원칙 7)
  4. 하이라이트 등급 세그먼트만 물리 클립을 따로 잘라 냄
  5. 계산한 타임코드를 segments.json·sessions.json·mentions.json에 되써 넣음

필요: macOS say, ffmpeg(brew install ffmpeg), Google Chrome
실행: python3 tools/build_media.py
"""
import json, os, re, subprocess, shutil, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OH = os.path.join(ROOT, "contents", "oral-history")  # 구술기록 페이지 폴더(데이터·매체·내려받기)
DATA = os.path.join(OH, "data")
MEDIA = os.path.join(OH, "media")
WORK = os.path.join(ROOT, "tools", "build")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SR = 24000
LEAD = 3.0        # 세션 첫머리 제목 화면
GAP_PARA = 0.7    # 문단 사이 쉼
GAP_SEG = 1.4     # 세그먼트 사이 쉼
TAIL = 1.5
W, H = 960, 540   # 출력 영상 크기


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def save(name, obj):
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("명령 실패: " + " ".join(cmd[:4]) + "\n" + r.stderr[-800:])
    return r


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(r.stdout.strip())


def tc(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return "%02d:%02d:%02d.%03d" % (h, m, s, ms)


def synth(text, spk, voices, out_wav):
    """문단 하나를 합성함. 화자 구분은 음높이·속도로 함"""
    v = voices["speakers"].get(spk, voices["default"])
    aiff = out_wav[:-4] + ".aiff"
    run(["say", "-v", v["voice"], "-r", str(v["rate"]), "-o", aiff, text])
    # pitch<1 이면 음높이를 낮춤. asetrate는 속도도 함께 바꾸므로 atempo로 보정하여
    # 최종 속도가 원래의 1/tempo 배가 되게 함(tempo>1 이면 조금 느리게 말함)
    p, t = v.get("pitch", 1.0), v.get("tempo", 1.0)
    af = "aresample=%d,asetrate=%d,aresample=%d,atempo=%.4f" % (SR, int(SR * p), SR, (1.0 / t) / p)
    run(["ffmpeg", "-y", "-v", "error", "-i", aiff, "-af", af, "-ac", "1", "-ar", str(SR), out_wav])
    os.remove(aiff)
    return duration(out_wav)


def silence(sec, out_wav):
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=%d:cl=mono" % SR, "-t", "%.3f" % sec, out_wav])


def shoot(params, out_png):
    url = "file://" + os.path.join(ROOT, "tools", "frame.html") + "#" + urllib.parse.quote(json.dumps(params, ensure_ascii=False))
    run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
         "--window-size=1280,720", "--screenshot=" + out_png, url])


def split_sentences(text):
    parts = re.split(r"(?<=[.?!])\s+", text.strip())
    out = []
    for p in parts:
        # 자막 한 줄이 너무 길면 쉼표에서 한 번 더 나눔
        if len(p) > 46 and ", " in p:
            a, b = p.split(", ", 1)
            out += [a + ",", b]
        else:
            out.append(p)
    return [x for x in out if x]


def vtt_cues(paras, offset=0.0):
    """문단 타임코드를 문장 길이에 비례해 나누어 자막 단위를 만듦"""
    cues = []
    for p in paras:
        sents = split_sentences(p["text"])
        total = sum(len(s) for s in sents) or 1
        t = p["_start"]
        for s in sents:
            d = p["_dur"] * len(s) / total
            cues.append((t - offset, t + d - offset, p["speaker"], s))
            t += d
    return cues


def write_vtt(cues, path):
    lines = ["WEBVTT", "", "NOTE 표본 자막 — 녹취문 문단 타임코드에서 자동 생성", ""]
    for i, (a, b, spk, s) in enumerate(cues, 1):
        lines += [str(i), "%s --> %s" % (tc(max(a, 0)), tc(max(b, 0))), "<v %s>%s" % (spk, s), ""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def encode(frames, wav, out_mp4):
    """프레임 목록(경로, 길이)과 음성을 합쳐 mp4를 만듦. 화면 오른쪽 아래에 음성 파형을 얹음"""
    lst = out_mp4 + ".txt"
    with open(lst, "w") as f:
        for path, d in frames:
            f.write("file '%s'\nduration %.3f\n" % (path, d))
        f.write("file '%s'\n" % frames[-1][0])
    fc = ("[0:v]scale=%d:%d,fps=12,format=yuv420p[bg];"
          "[1:a]showwaves=s=300x46:mode=cline:rate=12:colors=0x8A5A33,format=rgba,colorchannelmixer=aa=0.85[w];"
          "[bg][w]overlay=x=W-w-36:y=H-h-34:shortest=1[v]") % (W, H)
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", wav,
         "-filter_complex", fc, "-map", "[v]", "-map", "1:a",
         "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", "-shortest", out_mp4])
    os.remove(lst)


def jpg(png, out, width):
    run(["ffmpeg", "-y", "-v", "error", "-i", png, "-vf", "scale=%d:-2" % width, "-q:v", "4", out])


def main():
    for tool in ("ffmpeg", "ffprobe", "say"):
        if not shutil.which(tool):
            raise SystemExit(tool + " 이(가) 없습니다. brew install ffmpeg 후 다시 실행하십시오.")
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(os.path.join(MEDIA, "thumbs"), exist_ok=True)
    voices = json.load(open(os.path.join(ROOT, "tools", "voices.json"), encoding="utf-8"))
    narrators = {n["id"]: n for n in load("narrators.json")}
    sessions = load("sessions.json")
    segments = load("segments.json")
    mentions = load("mentions.json")
    seg_by_session = {}
    for s in segments:
        seg_by_session.setdefault(s["session_id"], []).append(s)

    for ses in sessions:
        nar = narrators[ses["narrator_id"]]
        segs = sorted(seg_by_session.get(ses["id"], []), key=lambda s: s["seq"])
        if not segs:
            continue   # 정리 중·방문 열람만 가능한 회차는 공개 세그먼트가 없어 영상을 만들지 않음
        wd = os.path.join(WORK, ses["id"])
        os.makedirs(wd, exist_ok=True)
        base = {"name": nar["name"], "position": nar["headline_position"], "session": ses["seq"],
                "palette": nar["photo"]["palette"], "mirror": nar["id"] == "n02",
                "project": ses["project_name"], "date": ses["date"].replace("-", ". ") + ".",
                "interviewer": ses["interviewer"]}
        print("▶", ses["id"], nar["name"])

        pieces, frames = [], []
        intro_png = os.path.join(wd, "intro.png")
        shoot(dict(base, mode="intro"), intro_png)
        silence(LEAD, os.path.join(wd, "lead.wav"))
        pieces.append(os.path.join(wd, "lead.wav"))
        frames.append((intro_png, LEAD))
        t = LEAD
        all_paras = []
        for s in segs:
            s["start_tc"] = tc(t)
            seg_start = t
            png = os.path.join(wd, s["id"] + ".png")
            shoot(dict(base, mode="onsite" if s["access_level"] == "onsite" else "seg", seq=s["seq"], title=s["title"]), png)
            jpg(png, os.path.join(MEDIA, "thumbs", s["id"] + ".jpg"), 960)
            if s["access_level"] == "onsite":
                # 방문 열람 구간은 녹취문을 공개 데이터에 싣지 않으므로 길이만 둠
                w = os.path.join(wd, s["id"] + "_onsite.wav")
                silence(s.get("planned_duration", 180.0), w)
                pieces.append(w)
                t += s.get("planned_duration", 180.0)
            for i, p in enumerate(s["transcript_sync"]):
                w = os.path.join(wd, p["id"] + ".wav")
                d = synth(p["text"], p["speaker"], voices, w)
                p["tc"] = tc(t)
                p["_start"], p["_dur"], p["_seg"] = t, d, s["id"]
                all_paras.append(p)
                pieces.append(w)
                t += d
                g = os.path.join(wd, "gap_p.wav")
                if not os.path.exists(g):
                    silence(GAP_PARA, g)
                pieces.append(g)
                t += GAP_PARA
            gs = os.path.join(wd, "gap_s.wav")
            if not os.path.exists(gs):
                silence(GAP_SEG, gs)
            pieces.append(gs)
            t += GAP_SEG
            s["end_tc"] = tc(t)
            s["_start"], s["_end"] = seg_start, t
            frames.append((png, t - seg_start))
        tail = os.path.join(wd, "tail.wav")
        silence(TAIL, tail)
        pieces.append(tail)
        t += TAIL
        frames[-1] = (frames[-1][0], frames[-1][1] + TAIL)
        ses["duration"] = tc(t)

        # 세션 음성 이어 붙이기
        lst = os.path.join(wd, "audio.txt")
        with open(lst, "w") as f:
            for p in pieces:
                f.write("file '%s'\n" % p)
        master_wav = os.path.join(wd, "master.wav")
        run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", master_wav])

        jpg(intro_png, os.path.join(MEDIA, ses["id"] + ".jpg"), 960)
        if ses.get("video_url"):
            # 전면 공개 세션: 원본 영상과 자막을 공개 경로에 둠
            encode(frames, master_wav, os.path.join(OH, ses["video_url"]))
            write_vtt(vtt_cues(all_paras), os.path.join(OH, ses["captions_url"]))
            print("  영상", ses["video_url"], ses["duration"])
        else:
            # 원본 비공개 세션: 하이라이트 등급 세그먼트만 물리 클립으로 잘라 냄
            master_mp4 = os.path.join(wd, "master.mp4")
            encode(frames, master_wav, master_mp4)
            for s in segs:
                if s["access_level"] == "highlight" and s.get("video_url"):
                    out = os.path.join(OH, s["video_url"])
                    a, b = s["_start"], s["_end"] - GAP_SEG / 2
                    run(["ffmpeg", "-y", "-v", "error", "-ss", "%.3f" % a, "-to", "%.3f" % b, "-i", master_mp4,
                         "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-c:a", "aac", "-b:a", "64k",
                         "-movflags", "+faststart", out])
                    paras = [p for p in all_paras if p["_seg"] == s["id"]]
                    write_vtt(vtt_cues(paras, offset=a), out[:-4] + ".vtt")
                    s["clip_offset_tc"] = s["start_tc"]
                    print("  하이라이트 클립", s["video_url"])

        # 언급 위치의 타임코드 — 문단 안 글자 위치에 비례해 추정함
        para_by_id = {p["id"]: p for p in all_paras}
        for m in mentions:
            p = para_by_id.get(m["paragraph_id"])
            if not p:
                continue
            idx = p["text"].find(m["surface"])
            if idx < 0:
                raise SystemExit("언급 표기를 문단에서 찾지 못함: %s %s" % (m["mention_id"], m["surface"]))
            m["char_start"] = idx
            m["tc"] = tc(p["_start"] + p["_dur"] * idx / max(len(p["text"]), 1))

    for s in segments:
        for k in ("_start", "_end"):
            s.pop(k, None)
        for p in s["transcript_sync"]:
            for k in ("_start", "_dur", "_seg"):
                p.pop(k, None)
    save("segments.json", segments)
    save("sessions.json", sessions)
    save("mentions.json", mentions)
    print("완료")


if __name__ == "__main__":
    main()
