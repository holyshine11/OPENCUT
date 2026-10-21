#!/bin/bash
# OpenCut 실행 (Apple Silicon / Intel Mac). Finder에서 더블클릭하면 된다.
# 처음 실행: Bun 설치 → 의존성 설치 → 빌드 → 실행. 이후엔 최신 코드를 받아 바뀐 경우만 다시 빌드한다.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
BUILT_MARK=apps/web/.next/BUILT_COMMIT

if ! command -v bun >/dev/null; then
	export PATH="$HOME/.bun/bin:$PATH"
fi
if ! command -v bun >/dev/null; then
	echo "Bun 설치 중..."
	curl -fsSL https://bun.sh/install | bash
	export PATH="$HOME/.bun/bin:$PATH"
fi

git pull --ff-only || echo "업데이트 실패, 기존 버전으로 실행합니다. (오프라인이거나 로컬 변경 있음)"

# 대본 읽기(TTS) 서버 주소 등 기본 설정. 이미 있으면 건드리지 않는다
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local
# 나중에 생긴 설정(예: MEDIA_FOLDER)은 기존 .env.local에 없으니 빠진 것만 덧붙인다
grep -E '^[A-Z_]+=' apps/web/.env.example | while IFS= read -r line; do
	grep -q "^${line%%=*}=" apps/web/.env.local || echo "$line" >> apps/web/.env.local
done

head=$(git rev-parse HEAD)
if [ "$(cat "$BUILT_MARK" 2>/dev/null)" != "$head" ]; then
	echo "설치·빌드 중 (몇 분 걸릴 수 있습니다)..."
	bun install
	# 받아쓰기 모델 (이미 받은 파일은 건너뜀). 실패하면 받아쓰기만 안 되고 앱은 뜬다
	bun run --cwd apps/web models || echo "모델 다운로드 실패, 인터넷 연결 후 다시 실행하세요."
	bun run build:web
	echo "$head" > "$BUILT_MARK"
fi

# 대본 읽기(TTS): 옆 폴더 ../TTS(설치: TTS/setup-mac.sh)가 있으면 함께 켜고, 이 창을 닫으면 같이 끈다 (합성 서버가 3GB 남짓 쓴다)
tts_url=$(sed -n 's/^TTS_URL=//p' apps/web/.env.local)
if [ -x ../TTS/tts-web.sh ] && ! curl -s -o /dev/null "$tts_url/voices"; then
	tts_dir=$(cd ../TTS && pwd)
	"$tts_dir/tts-web.sh" >> "$tts_dir/tts-web.log" 2>&1 &
	trap 'kill '$!' 2>/dev/null; pkill -f "$tts_dir/.tts-server.yaml" || true' EXIT
	echo "대본 읽기(TTS) 서버를 켜는 중... (로그: $tts_dir/tts-web.log)"
fi

(until curl -s -o /dev/null "http://localhost:$PORT"; do sleep 1; done; open "http://localhost:$PORT") &
echo "OpenCut 실행 중: http://localhost:$PORT  (종료: 이 창에서 Ctrl+C)"
# 이 맥에서만 접속하게 한다 (미디어 폴더 API가 디스크에 파일을 쓴다)
PORT="$PORT" bun run --cwd apps/web start -H 127.0.0.1
