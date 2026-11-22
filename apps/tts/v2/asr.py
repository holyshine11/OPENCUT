# 녹음을 Whisper large-v3(MLX)로 낱말 타임스탬프까지 받아 적는다: python asr.py out.json in.wav...
import sys, json, mlx_whisper
out, paths = sys.argv[1], sys.argv[2:]
res = {}
for p in paths:
    r = mlx_whisper.transcribe(p, path_or_hf_repo="mlx-community/whisper-large-v3-mlx", language="ko",
                               word_timestamps=True, condition_on_previous_text=False, temperature=0.0)
    res[p.split("/")[-1]] = [dict(s=s["start"], e=s["end"], t=s["text"].strip(),
                                  w=[(w["word"], round(w["start"], 2), round(w["end"], 2), round(w["probability"], 3)) for w in s.get("words", [])])
                             for s in r["segments"]]
    print(p, len(res[p.split("/")[-1]]), flush=True)
json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
