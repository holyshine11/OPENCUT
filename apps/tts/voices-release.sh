#!/bin/sh
# usage: ./voices-release.sh   (개발 맥에서 실행: 목소리 묶음을 만들어 GitHub Release 로 올린다. 다른 맥은 setup-mac.sh 가 받는다)
# 묶음 = tts-voices.json 의 가중치 + 말투 파일·tts.env 가 쓰는 참조 음성. 목소리를 새로 학습하면 tts-voices.json 을 고치고 다시 돌린다
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
cd "$dir"
. ./tts.env
. ./setup.env
tag="$SETUP_VOICES_TAG_PREFIX$(date +%Y%m%d)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
{
  jq -r '.[] | "GPT-SoVITS/\(.gpt_weights)", "GPT-SoVITS/\(.sovits_weights)"' "$TTS_VOICES_FILE"
  jq -r '.[].styles_file' "$TTS_VOICES_FILE" |
    xargs jq -r '.[] | (.params.ref_audio_path // empty), (.params.aux_ref_audio_paths // [])[], (.style_aux // [])[]'
  echo "$TTS_REF_AUDIO"
  printf '%s\n' $TTS_AUX_REFS
} | sort -u > "$tmp/files"
tar -cf "$tmp/$SETUP_VOICES_ASSET" -T "$tmp/files"
echo "$(wc -l < "$tmp/files" | tr -d ' ')개 파일, $(du -h "$tmp/$SETUP_VOICES_ASSET" | cut -f1) → $tag"
gh release create "$tag" "$tmp/$SETUP_VOICES_ASSET" -R "$SETUP_VOICES_REPO" --title "목소리 묶음 $tag" \
  --notes "$(jq -r '.[] | "\(.name): \(.model)"' "$TTS_VOICES_FILE")"
