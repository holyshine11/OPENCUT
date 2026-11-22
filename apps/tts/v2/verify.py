# 학습 클립 검사: 클립을 다시 받아써 정답 글과 비교한다(글 밖의 말이 붙었거나 잘린 클립 찾기)
# python verify.py clips_dir  → clips_dir/verify.json  (힌트를 주면 받아쓰기가 말을 지어내므로 주지 않는다)
import sys, json, pathlib, mlx_whisper
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from align import norm, g
d = pathlib.Path(sys.argv[1])
rows = [json.loads(l) for f in ("train.jsonl", "holdout.jsonl") for l in open(d / f)]
out = {}
for r in rows:
    res = mlx_whisper.transcribe(r["audio"], path_or_hf_repo="mlx-community/whisper-large-v3-mlx", language="ko", temperature=0.0,
                                 condition_on_previous_text=False, word_timestamps=True)
    heard = res["text"].strip()
    words = [w for s in res["segments"] for w in s["words"]]
    a, b = norm(r["text"]), norm(heard)
    out[r["id"]] = dict(text=r["text"], heard=heard, cer=round(g["cer"](a, b), 3), extra=len(b) - len(a),
                        first=words[0]["start"] if words else None, last=words[-1]["end"] if words else None, dur=r["dur"])
json.dump(out, open(d / "verify.json", "w"), ensure_ascii=False, indent=1)
bad = {k: v for k, v in out.items() if v["cer"] > 0.12}
print(f"검사 {len(out)}, 문제 {len(bad)}")
for k, v in sorted(bad.items(), key=lambda x: -x[1]["cer"]):
    print(f"{k} cer {v['cer']} extra {v['extra']} | {v['text'][:40]} | {v['heard'][:70]}")
