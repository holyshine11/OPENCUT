# 학습 없이 참조 클립만으로 평가 문장을 합성하고 M1 생성 시간·메모리를 잰다
# python zeroshot.py model_id out_dir clips_dir  (홀드아웃 문장 + evalset.txt, 화자별 참조는 학습 클립 중 깨끗한 8~12초)
import sys, os, json, time, pathlib, numpy as np, soundfile as sf, mlx.core as mx
from mlx_audio.tts.utils import load_model
mid, od, cd = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
od.mkdir(parents=True, exist_ok=True)
train = [json.loads(l) for l in open(cd / "train.jsonl")]
hold = [json.loads(l) for l in open(cd / "holdout.jsonl")]
extra = [l.strip() for l in open(pathlib.Path(__file__).parent / "evalset.txt") if l.strip()]
t0 = time.time(); model = load_model(mid); load_s = time.time() - t0
log = dict(model=mid, load_s=round(load_s, 1), items=[])
for spk in ("songi", "songkang"):
    ref = max((r for r in train if r["spk"] == spk and r["clean"] and 8 <= r["dur"] <= 12), key=lambda r: r["dur"])
    items = [(h["id"], h["text"]) for h in hold if h["spk"] == spk] + [(f"x{i:02d}", t) for i, t in enumerate(extra)]
    for k, (iid, text) in enumerate(items):
        mx.reset_peak_memory()
        t0 = time.time()
        res = list(model.generate(text=text, ref_audio=ref["audio"], ref_text=ref["text"]))
        audio = np.concatenate([np.array(r.audio, dtype=np.float32) for r in res])
        sr = res[0].sample_rate
        el = time.time() - t0
        sf.write(od / f"{spk}_{iid}.wav", audio, sr)
        log["items"].append(dict(spk=spk, id=iid, text=text, ref=ref["id"], sec=round(len(audio) / sr, 2), gen_s=round(el, 2),
                                 rtf=round(el / max(0.1, len(audio) / sr), 2), peak_gb=round(mx.get_peak_memory() / 1e9, 2)))
        print(spk, iid, log["items"][-1]["sec"], "s  rtf", log["items"][-1]["rtf"], flush=True)
json.dump(log, open(od / "log.json", "w"), ensure_ascii=False, indent=1)
it = log["items"][2:]  # 첫 몇 개는 예열
print("RTF 중앙", np.median([i["rtf"] for i in it]), "최대 메모리", max(i["peak_gb"] for i in log["items"]), "GB")
