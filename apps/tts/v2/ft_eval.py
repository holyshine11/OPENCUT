# 미세조정 체크포인트(HF 형식)를 MLX 로 바꿔 평가 문장을 합성: python ft_eval.py ckpt_dir speaker out_dir clips_dir [q_bits]
# 끝없이 이어 말하는 실패를 막으려고 글자 수에 비례한 토큰 상한을 둔다(12.5 토큰/초, 실제 말은 6자/초 안팎)
import sys, os, re, json, time, pathlib, subprocess, numpy as np, soundfile as sf, mlx.core as mx
from mlx_audio.tts.utils import load_model
ck, spk, od, cd = pathlib.Path(sys.argv[1]), sys.argv[2], pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4])
qb = sys.argv[5] if len(sys.argv) > 5 else ""  # "", "fp16", "q8", "q6", "fp16q8" ...
mlx_dir = ck.parent / f"{ck.name}-mlx{qb}"
if not (mlx_dir / "config.json").exists():
    cmd = [sys.executable, "-m", "mlx_audio.convert", "--hf-path", str(ck), "--mlx-path", str(mlx_dir), "--model-domain", "tts"]
    if "fp16" in qb: cmd += ["--dtype", "float16"]  # M1 GPU 는 bf16 을 하드웨어로 못 돌린다
    if "q" in qb: cmd += ["-q", "--q-bits", qb.split("q")[-1]]
    subprocess.run(cmd, check=True)
od.mkdir(parents=True, exist_ok=True)
model = load_model(str(mlx_dir))
hold = [json.loads(l) for l in open(cd / "holdout.jsonl")]
extra = [l.strip() for l in open(pathlib.Path(__file__).parent / "evalset.txt") if l.strip()]
items = [(h["id"], h["text"]) for h in hold if h["spk"] == spk] + [(f"x{i:02d}", t) for i, t in enumerate(extra)]
log = dict(model=f"{ck.parent.name}/{ck.name}{'-q' + qb if qb else ''}", items=[])
for iid, text in items:
    cap = len(re.findall("[가-힣0-9A-Za-z]", text)) * 4 + 30
    mx.reset_peak_memory(); t0 = time.time()
    res = list(model.generate_custom_voice(text=text, speaker=spk, language="auto", max_tokens=cap))
    audio = np.concatenate([np.array(r.audio, dtype=np.float32) for r in res]); sr = res[0].sample_rate; el = time.time() - t0
    sf.write(od / f"{spk}_{iid}.wav", audio, sr)
    log["items"].append(dict(spk=spk, id=iid, text=text, sec=round(len(audio) / sr, 2), gen_s=round(el, 2), rtf=round(el / max(0.1, len(audio) / sr), 2),
                             peak_gb=round(mx.get_peak_memory() / 1e9, 2), capped=len(audio) / sr >= cap / 12.5 - 0.2))
    print(iid, log["items"][-1]["sec"], "rtf", log["items"][-1]["rtf"], flush=True)
json.dump(log, open(od / "log.json", "w"), ensure_ascii=False, indent=1)
print("RTF 중앙", np.median([i["rtf"] for i in log["items"][1:]]), "최대 메모리", max(i["peak_gb"] for i in log["items"]), "상한 걸림", sum(i["capped"] for i in log["items"]))
