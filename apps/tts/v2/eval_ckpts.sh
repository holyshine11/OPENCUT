#!/bin/sh
# 학습 중 저장되는 체크포인트를 차례로 평가: sh eval_ckpts.sh run_name speaker base_repo
# (학습 중인 프로세스는 옛 저장 코드라 speech_tokenizer 가중치를 채워 넣는다)
set -e
cd "$(dirname "$0")/.."
run=$1; spk=$2; base=$3
SRC=$(v2/.venv-qt/bin/python -c "from huggingface_hub import snapshot_download; print(snapshot_download('$base'))" 2>/dev/null | tail -1)
for e in 2 4 6 8 10; do
  ck=data/ft/$run/e$e; out=data/p3/${run}_e$e
  until [ -f $ck/model.safetensors ] && [ -z "$(lsof $ck/model.safetensors 2>/dev/null)" ]; do sleep 20; done
  [ -f $ck/speech_tokenizer/model.safetensors ] || cp -L $SRC/speech_tokenizer/model.safetensors $ck/speech_tokenizer/
  [ -f $out/voice.json ] && continue
  v2/.venv/bin/python -I v2/ft_eval.py $ck $spk $out data/clips_fa > /dev/null 2>&1
  v2/.venv/bin/python -I v2/eval_asr.py $out > /dev/null 2>&1
  GPT-SoVITS/.venv/bin/python v2/eval_voice.py $PWD data/clips_fa $out 2>&1 | grep -E "  $spk:" | sed "s|^|e$e |"
done
