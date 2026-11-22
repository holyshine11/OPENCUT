# 합성 결과 받아쓰기 → 문장별 CER: python eval_asr.py out_dir  (out_dir/log.json 의 문장과 비교, out_dir/asr.json 저장)
import sys, json, pathlib, mlx_whisper
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from align import norm, g  # noqa: 대본 맞추기와 같은 숫자 읽기·글자 정규화
d = pathlib.Path(sys.argv[1]); log = json.load(open(d / "log.json"))
out = {}
for it in log["items"]:
    f = d / f"{it['spk']}_{it['id']}.wav"
    t = mlx_whisper.transcribe(str(f), path_or_hf_repo="mlx-community/whisper-large-v3-mlx", language="ko", temperature=0.0, condition_on_previous_text=False)["text"].strip()
    out[f.name] = dict(text=it["text"], heard=t, cer=round(g["cer"](norm(it["text"]), norm(t)), 3))
json.dump(out, open(d / "asr.json", "w"), ensure_ascii=False, indent=1)
