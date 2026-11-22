# Qwen3-TTS 학습 입력 만들기: 클립을 24kHz로 바꾸고 화자별 train_raw.jsonl (audio, text, ref_audio, language) 작성
# python qwen_data.py clips_dir out_dir   — 참조는 화자마다 하나로 고정(공식 권장): 깨끗한 학습 클립 중 8~12초 최장
import sys, json, pathlib, numpy as np, soundfile as sf
from scipy.signal import resample_poly
cd, od = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
(od / "wav24").mkdir(parents=True, exist_ok=True)
def to24(src):
    dst = od / "wav24" / pathlib.Path(src).name
    if not dst.exists():
        y, sr = sf.read(src, dtype="float32")
        sf.write(dst, resample_poly(y, 24000, sr).astype(np.float32) if sr != 24000 else y, 24000, subtype="PCM_16")
    return str(dst.resolve())
train = [json.loads(l) for l in open(cd / "train.jsonl")]
for spk in ("songi", "songkang"):
    rows = [r for r in train if r["spk"] == spk]
    ref = max((r for r in rows if r["clean"] and 8 <= r["dur"] <= 12), key=lambda r: r["dur"])
    with open(od / f"{spk}_raw.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(dict(audio=to24(r["audio"]), text=r["text"], ref_audio=to24(ref["audio"]), language="Korean"), ensure_ascii=False) + "\n")
    print(spk, len(rows), "ref", ref["id"], ref["text"])
