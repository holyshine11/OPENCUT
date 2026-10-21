#!/bin/sh
# usage: apps/tts/setup-mac.sh   (대본 읽기(TTS)를 새 맥에 설치하거나 업데이트한다. 다시 돌려도 된다 — 이미 받은 것은 건너뛴다. 받을 것: setup.env)
# 필요: Homebrew (https://brew.sh). 끝나면 합성을 한 번 돌려 확인하고, 그 뒤로는 인터넷 없이 돈다
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
cd "$dir"

step() { printf '\n== %s\n' "$*"; }

# 파일이 없을 때만 받는다 (중간에 끊기면 .part 가 남아 다음에 처음부터 다시 받는다)
get() {
  [ -s "$2" ] && return
  mkdir -p "$(dirname "$2")"
  curl -fL --progress-bar -o "$2.part" "$1"
  mv "$2.part" "$2"
}

main() {
  set -a
  . ./tts.env
  . ./setup.env
  set +a
  eng="$dir/GPT-SoVITS"

  step "도구 (ffmpeg, uv, gh, jq)"
  command -v brew >/dev/null || { echo "Homebrew 가 필요합니다. https://brew.sh 의 설치 명령을 실행한 뒤 다시 돌리세요." >&2; exit 1; }
  for t in ffmpeg uv gh jq; do command -v "$t" >/dev/null || brew install "$t"; done
  gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https

  step "GPT-SoVITS 엔진 ($(echo "$SETUP_ENGINE_COMMIT" | cut -c1-7) + $SETUP_ENGINE_PATCH)"
  [ -d "$eng/.git" ] || { git init -q "$eng" && git -C "$eng" remote add origin "$SETUP_ENGINE_REPO"; }
  if [ "$(git -C "$eng" rev-parse -q --verify HEAD || true)" != "$SETUP_ENGINE_COMMIT" ]; then
    git -C "$eng" fetch -q --depth 1 origin "$SETUP_ENGINE_COMMIT"
    git -C "$eng" -c advice.detachedHead=false checkout -q -f FETCH_HEAD  # 엔진 수정은 전부 패치에 있어 지워도 된다
  fi
  if ! git -C "$eng" apply --reverse --check "$dir/$SETUP_ENGINE_PATCH" 2>/dev/null; then
    git -C "$eng" checkout -q -- .  # 예전 패치를 걷고 새 패치를 건다
    git -C "$eng" apply "$dir/$SETUP_ENGINE_PATCH"
  fi

  step "파이썬 $SETUP_PYTHON 과 패키지 (처음엔 2GB 남짓 받는다)"
  [ -x "$eng/.venv/bin/python" ] || uv venv -q --python "$SETUP_PYTHON" "$eng/.venv"
  uv pip install -q --python "$eng/.venv/bin/python" -r "$SETUP_REQUIREMENTS"
  # shellcheck disable=SC2086
  "$eng/.venv/bin/python" -m nltk.downloader -q -d "$eng/.venv/nltk_data" $SETUP_NLTK_DATA

  step "사전학습 모델"
  for f in $SETUP_MODELS; do get "$SETUP_MODELS_URL/$f" "$eng/GPT_SoVITS/pretrained_models/$f"; done
  get "$SETUP_LANGDETECT_URL" "$eng/GPT_SoVITS/pretrained_models/fast_langdetect/lid.176.bin"
  get "$SETUP_DEREVERB_URL" "$dir/$TTS_DEREVERB_MODEL"
  for f in $SETUP_ASR_FILES; do get "$SETUP_ASR_URL/$f" "$dir/$TTS_WEB_ASR_MODEL/$f"; done

  step "목소리 묶음"
  tag=$(gh release list -R "$SETUP_VOICES_REPO" --json tagName \
    --jq "map(select(.tagName | startswith(\"$SETUP_VOICES_TAG_PREFIX\")))[0].tagName // empty")
  [ -n "$tag" ] || { echo "$SETUP_VOICES_REPO 에 목소리 묶음 Release 가 없습니다 (개발 맥에서 ./voices-release.sh)" >&2; exit 1; }
  if [ "$(cat "$SETUP_VOICES_STAMP" 2>/dev/null || true)" = "$tag" ]; then
    echo "$tag 이미 받음"
  else
    tmp=$(mktemp -d)
    gh release download "$tag" -R "$SETUP_VOICES_REPO" -p "$SETUP_VOICES_ASSET" -D "$tmp"
    tar -xf "$tmp/$SETUP_VOICES_ASSET" -C "$dir"
    rm -rf "$tmp"
    echo "$tag" > "$SETUP_VOICES_STAMP"
  fi

  step "설치 확인 (목소리마다 한 문장씩 합성)"
  started=
  if ! curl -s -o /dev/null "http://$TTS_WEB_HOST:$TTS_WEB_PORT/voices"; then
    "$dir/tts-web.sh" >> "$dir/tts-web.log" 2>&1 &
    started=$!
    until curl -s -o /dev/null "http://$TTS_WEB_HOST:$TTS_WEB_PORT/voices"; do
      kill -0 "$started" 2>/dev/null || { echo "웹 화면이 켜지지 않았습니다. 로그: tts-web.log, tts-server.log" >&2; exit 1; }
      sleep 1
    done
  fi
  ok=1
  for name in $(jq -r '.[].name' "$TTS_VOICES_FILE"); do
    style=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .styles_file' "$TTS_VOICES_FILE" | xargs jq -r '.[0].id // .[0].name')
    code=$(jq -n --arg text "$SETUP_CHECK_TEXT" --arg voice "$name" --arg style "$style" --arg q "$TTS_QUESTION_END" \
      --argjson speed "$TTS_SPEED" --argjson pause "$TTS_FRAGMENT_INTERVAL" \
      '{text: $text, voice: $voice, style: $style, speed: $speed, pause: $pause, question: $q, format: "wav"}' |
      curl -s -o "$dir/out.wav" -w '%{http_code}' "http://$TTS_WEB_HOST:$TTS_WEB_PORT/synth" -H 'Content-Type: application/json' -d @-)
    if [ "$code" = 200 ]; then echo "$name: 합성 성공"; else echo "$name: 합성 실패 ($code) $(cat "$dir/out.wav")" >&2; ok=; fi
  done
  if [ -n "$started" ]; then  # 확인하려고 켠 것만 끈다
    kill "$started" && wait "$started" 2>/dev/null || true  # tts-web.sh 가 끝나며 합성 서버도 끈다
  fi
  [ -n "$ok" ] || exit 1
  printf '\n설치 완료. bun run dev:web 과 start-mac.command 가 대본 읽기 서버를 함께 켭니다.\n'
}

# 함수로 감싸 전체를 먼저 읽는다 — 실행 중에 이 파일이 바뀌어도 안전하다
main "$@"
