# 맞춘 문장 경계로 정제 음성을 문장 클립으로 자른다: python cut.py align.json in_dir suffix out_dir
# 경계는 앞뒤 문장 사이에서 가장 조용한 지점, 클립 앞뒤 무음은 최대 0.25초. 녹음 단위로 -23 LUFS
import sys, os, json, numpy as np, soundfile as sf, pyloudnorm as pyln
al, ind, suf, od = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(od, exist_ok=True)
HOP, PAD = 0.01, 0.25
meta = []
for name, v in al.items():
    b = name[:-4]
    y, sr = sf.read(f"{ind}/{b}{suf}.wav", dtype="float32")
    y = y * 10 ** ((-23 - pyln.Meter(sr).integrated_loudness(y)) / 20)
    h = int(HOP * sr)
    db = 20 * np.log10(np.sqrt(np.convolve(y ** 2, np.ones(h) / h, "same")[::h]) + 1e-9)
    floor = np.percentile(db, 10)
    voiced = db > max(floor + 12, -60)
    rows = [r for r in v["sentences"] if r["s"] is not None]
    fr = lambda t: int(round(t / HOP))
    bounds = []
    for k in range(len(rows) + 1):
        a = rows[k - 1]["e"] if k else max(0, rows[0]["s"] - 1.0)
        c = rows[k]["s"] if k < len(rows) else min(len(y) / sr, rows[-1]["e"] + 1.0)
        if c - a < 0.3:
            a, c = (a + c) / 2 - 0.15, (a + c) / 2 + 0.15  # 말이 붙어 있으면 경계 주변에서 찾는다
        i0 = min(max(0, fr(a)), len(db) - 1); i1 = max(i0 + 1, fr(c))
        bounds.append((i0 + int(np.argmin(db[i0:i1]))) * HOP)
    for k, r in enumerate(rows):
        s0, s1 = fr(bounds[k]), fr(bounds[k + 1])
        vi = np.nonzero(voiced[s0:s1])[0]
        if len(vi) == 0:
            continue
        a = max(bounds[k], (s0 + vi[0]) * HOP - PAD)
        c = min(bounds[k + 1], (s0 + vi[-1] + 1) * HOP + PAD)
        clip = y[int(a * sr):int(c * sr)]
        cid = f"{b}_{r['i']:02d}"
        sf.write(f"{od}/{cid}.wav", clip, sr, subtype="PCM_24")
        meta.append(dict(id=cid, src=b, i=r["i"], start=round(a, 2), end=round(c, 2), dur=round(len(clip) / sr, 2),
                         script=r["text"], heard=r["heard"], cer=r["cer"], peak_db=round(float(20 * np.log10(np.abs(clip).max() + 1e-9)), 1)))
json.dump(meta, open(f"{od}/clips.json", "w"), ensure_ascii=False, indent=1)
d = np.array([m["dur"] for m in meta])
print(f"클립 {len(meta)}, 총 {d.sum() / 60:.1f}분, 길이 {d.min():.1f}~{d.max():.1f}초 (중앙 {np.median(d):.1f}), 피크 최대 {max(m['peak_db'] for m in meta)}dB")
