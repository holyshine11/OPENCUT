#!/bin/bash
# OpenCut 실행 (Apple Silicon / Intel Mac). Finder에서 더블클릭하면 된다.
# 처음 실행: Bun 설치 → 의존성 설치 → 빌드 → 실행. 이후엔 최신 코드를 받아 바뀐 경우만 다시 빌드한다.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
ENV_FILE=apps/web/.env.local
BUILT_MARK=apps/web/.next/BUILT_COMMIT

if ! command -v bun >/dev/null; then
	export PATH="$HOME/.bun/bin:$PATH"
fi
if ! command -v bun >/dev/null; then
	echo "Bun 설치 중..."
	curl -fsSL https://bun.sh/install | bash
	export PATH="$HOME/.bun/bin:$PATH"
fi

git pull --ff-only || echo "최신 코드 받기 실패 (오프라인이거나 로컬 변경 있음) — 현재 버전으로 실행합니다."

if [ ! -f "$ENV_FILE" ]; then
	cp apps/web/.env.example "$ENV_FILE"
	sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
fi

head=$(git rev-parse HEAD)
if [ "$(cat "$BUILT_MARK" 2>/dev/null)" != "$head" ]; then
	echo "설치·빌드 중 (몇 분 걸릴 수 있습니다)..."
	bun install
	bun run build:web
	echo "$head" > "$BUILT_MARK"
fi

(until curl -s -o /dev/null "http://localhost:$PORT"; do sleep 1; done; open "http://localhost:$PORT/projects") &
echo "OpenCut 실행 중: http://localhost:$PORT  (종료: 이 창에서 Ctrl+C)"
PORT="$PORT" bun run --cwd apps/web start
