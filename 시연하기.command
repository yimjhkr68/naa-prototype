#!/bin/bash
# 국회기록원 프로토타입 시연 — 더블클릭하면 로컬 서버를 띄우고 첫 화면을 브라우저로 엶
# 첫 화면 / 국회의원 컬렉션(collection/) / 기록콘텐츠(contents/) / 구술기록(contents/oral-history/)
# (JSON 데이터·자막·Google 지도는 파일을 바로 열면 동작하지 않으므로 서버로 엶)
# Google 지도 키는 http://localhost:8000/* 로 제한되어 있으므로 8000번 포트를 씀
cd "$(dirname "$0")"
PORT=8000
URL="http://localhost:$PORT/"
if curl -s "${URL}contents/oral-history/config.js" 2>/dev/null | grep -q "OH_CONFIG"; then
  echo "이미 실행 중인 시연 서버를 엽니다: $URL"
  open "$URL"
  exit 0
fi
if lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "8000번 포트를 다른 프로그램이 쓰고 있습니다. 그 프로그램을 끄고 다시 실행하십시오."
  echo "(다른 포트로 열면 Google 지도 키 제한 때문에 지도가 표시되지 않습니다)"
  read -n 1 -s -r -p "아무 키나 누르면 창을 닫습니다"
  exit 1
fi
echo "첫 화면: $URL"
echo "구술기록: ${URL}contents/oral-history/"
( sleep 1; open "$URL" ) &
# 영상 구간 이동을 위해 Range 요청을 지원하는 서버를 씀(파이썬 기본 서버는 미지원)
python3 tools/serve.py $PORT
