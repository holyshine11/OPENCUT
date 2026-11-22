# 강제 정렬(MMS_FA)로 클립 경계를 다시 자른다. 정답 글 앞뒤에 '*'(아무 말) 토큰을 둬서 창 안의 다른 문장 말은 흡수한다.
# python fa_cut.py old_clips_dir dn_dir suffix new_clips_dir   (old 의 train/holdout.jsonl 글과 clips.json 위치를 쓴다)
import sys, json, re, pathlib, numpy as np, soundfile as sf, pyloudnorm as pyln, torch, torchaudio, uroman
import torchaudio.functional as F
from scipy.signal import resample_poly
old, dn, suf, new = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], pathlib.Path(sys.argv[4])
new.mkdir(parents=True, exist_ok=True)
clips = {c["id"]: c for c in json.load(open(old / "clips.json"))}
lists = {f: [json.loads(l) for l in open(old / f"{f}.jsonl")] for f in ("train", "holdout")}
B = torchaudio.pipelines.MMS_FA; model = B.get_model(with_star=True).eval(); dic = B.get_dict(star="*"); ur = uroman.Uroman()
audio = {}
def rec(src):
    if src not in audio:
        y, sr = sf.read(dn / f"{src}{suf}.wav", dtype="float32")
        y = y * 10 ** ((-23 - pyln.Meter(sr).integrated_loudness(y)) / 20)
        audio[src] = (y, sr, resample_poly(y, 1, 3).astype(np.float32))  # 48k → 16k
    return audio[src]
def quiet(y, sr, a, b):  # [a,b] 초 사이 가장 조용한 10ms 지점
    h = int(0.01 * sr); i0, i1 = max(0, int(a * sr)), min(len(y), int(b * sr))
    seg = y[i0:i1]
    if len(seg) < h * 2: return (a + b) / 2
    e = np.convolve(seg ** 2, np.ones(h), "valid")[::h // 2]
    return (i0 + int(np.argmin(e)) * (h // 2) + h // 2) / sr
out_lists = {}
for f, rows in lists.items():
    out_lists[f] = []
    for r in rows:
        c = clips[r["id"]]; y, sr, y16 = rec(c["src"])
        w0, w1 = max(0.0, c["start"] - 1.2), min(len(y) / sr, c["end"] + 1.2)
        x = torch.from_numpy(y16[int(w0 * 16000):int(w1 * 16000)])[None]
        words = [re.sub(f"[^{''.join(k for k in dic if k not in '-*')}]", "", w) for w in ur.romanize_string(r["text"]).lower().split()]
        words = [w for w in words if w]
        toks = [dic["*"]] + [dic[ch] for w in words for ch in w] + [dic["*"]]
        with torch.inference_mode():
            em, _ = model(x)
        al, sc = F.forced_align(em, torch.tensor([toks], dtype=torch.int32), blank=0)
        spans = F.merge_tokens(al[0], sc[0].exp())
        fps = x.shape[1] / em.shape[1] / 16000
        body = spans[1:-1]
        t0, t1 = w0 + body[0].start * fps, w0 + body[-1].end * fps
        score = float(np.mean([s.score for s in body]))
        a = quiet(y, sr, t0 - 0.35, t0 - 0.03); b = quiet(y, sr, t1 + 0.05, t1 + 0.4)
        clip = y[int(a * sr):int(b * sr)]
        dst = new / f"{r['id']}.wav"; sf.write(dst, clip, sr, subtype="PCM_24")
        out_lists[f].append(dict(r, audio=str(dst.resolve()), dur=round(len(clip) / sr, 2), fa_score=round(score, 3),
                                 moved=round(a - c["start"], 2), moved_end=round(b - c["end"], 2)))
for f, rows in out_lists.items():
    with open(new / f"{f}.jsonl", "w") as fh:
        for r in rows: fh.write(json.dumps(r, ensure_ascii=False) + "\n")
allr = [r for rows in out_lists.values() for r in rows]
print("클립", len(allr), "정렬 점수 중앙", np.median([r["fa_score"] for r in allr]))
for r in sorted(allr, key=lambda r: r["fa_score"])[:12]:
    print(f"  낮음 {r['id']} {r['fa_score']} | {r['text'][:40]}")
big = [r for r in allr if abs(r["moved"]) > 0.4 or abs(r["moved_end"]) > 0.4]
print("경계가 0.4초 넘게 바뀐 클립", len(big)); [print(f"  {r['id']} 앞 {r['moved']:+} 뒤 {r['moved_end']:+}") for r in big[:40]]
