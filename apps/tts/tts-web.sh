#!/bin/sh
# usage: ./tts-web.sh   (대본 읽기 서버, 주소·포트: tts.env — 끄려면 Ctrl+C. bun run dev:web·start-mac.command 가 함께 켠다)
# 합성 서버가 꺼져 있으면 먼저 켜고, 이 스크립트가 끝날 때 같이 끈다 (로그: tts-server.log).
# 설치 전이거나 이미 켜져 있으면 아무것도 하지 않고 끝난다 — 웹은 대본 읽기 탭만 "서버 없음"으로 뜬다
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
set -a
. "$dir/tts.env"
set +a
py="$dir/GPT-SoVITS/.venv/bin/python"
[ -x "$py" ] || { echo "대본 읽기(TTS)가 설치되지 않아 건너뜁니다. 설치: apps/tts/setup-mac.sh"; exit 0; }
if curl -s -o /dev/null "http://$TTS_WEB_HOST:$TTS_WEB_PORT/voices"; then
  echo "대본 읽기(TTS) 서버가 이미 켜져 있습니다 ($TTS_WEB_HOST:$TTS_WEB_PORT)"
  exit 0
fi
server= web=
# 둘 다 뒤에서 돌리고 wait 한다 — 앞에서 돌리면 끄라는 신호가 와도 그 프로세스가 끝날 때까지 trap 이 돌지 않는다
trap 'kill $web $server 2>/dev/null || true' EXIT
trap 'exit 143' INT TERM HUP
if ! curl -s -o /dev/null "${TTS_API_URL%/tts}"; then
  echo "합성 서버를 켜는 중..."
  "$dir/tts-server.sh" >> "$dir/tts-server.log" 2>&1 &
  server=$!
  until curl -s -o /dev/null "${TTS_API_URL%/tts}"; do
    kill -0 "$server" 2>/dev/null || { echo "합성 서버가 켜지지 않았습니다. 로그: $dir/tts-server.log" >&2; exit 1; }
    sleep 1
  done
fi
"$py" "$dir/tts-web.py" &
web=$!
wait "$web"
