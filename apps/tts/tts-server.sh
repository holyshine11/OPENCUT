#!/bin/sh
# usage: ./tts-server.sh   (합성 서버 실행, 주소·설정: tts.env — 끄려면 Ctrl+C)
# 목소리마다 서버를 따로 띄우지 않는다. 처음엔 TTS_CONFIG 의 가중치(송이)로 켜지고, tts-web.py 가 목소리에 맞춰 갈아 끼운다
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
. "$dir/tts.env"
cd "$dir/GPT-SoVITS"
cp "$TTS_CONFIG" "$dir/$TTS_SERVER_CONFIG"
exec .venv/bin/python api_v2.py -a "$TTS_API_HOST" -p "$TTS_API_PORT" -c "$dir/$TTS_SERVER_CONFIG"
