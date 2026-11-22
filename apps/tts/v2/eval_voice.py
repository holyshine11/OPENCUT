# 닮은 정도(ERes2NetV2, 홀드아웃 실제 녹음 평균 대비)·음높이·말 속도: GPT-SoVITS 가상환경에서 실행
# python eval_voice.py tts_dir clips_dir out_dir...
import sys, os, json, re, pathlib, numpy as np, soundfile as sf, librosa
from scipy.signal import resample_poly
tts, cd, outs = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]).resolve(), [pathlib.Path(p).resolve() for p in sys.argv[3:]]
gsv = tts / "GPT-SoVITS"; os.chdir(gsv); sys.path[:0] = [str(gsv / "GPT_SoVITS"), str(gsv / "GPT_SoVITS/eres2net")]
import torch; from sv import SV
svm = SV("cpu", False)
def load16(p):
    y, sr = sf.read(p, dtype="float32"); y = y.mean(1) if y.ndim > 1 else y
    return resample_poly(y, 16000, sr).astype(np.float32) if sr != 16000 else y
def emb(p):
    e = svm.compute_embedding3(torch.from_numpy(load16(p)[None])).squeeze(0).numpy(); return e / np.linalg.norm(e)
def f0med(y):
    f0, v, _ = librosa.pyin(y, fmin=65, fmax=450, sr=16000, frame_length=1024, hop_length=320); f0 = f0[v & ~np.isnan(f0)]
    return float(np.median(f0)) if len(f0) else float("nan")
def rate(y, text):  # 조음 속도: 글자 수 / 소리 나는 시간
    db = 20 * np.log10(librosa.feature.rms(y=y, frame_length=640, hop_length=160)[0] + 1e-9)
    return len(re.findall("[가-힣]", text)) / max(0.3, (db > db.max() - 35).sum() * 0.01)
hold = [json.loads(l) for l in open(cd / "holdout.jsonl")]
ref = {}
for spk in ("songi", "songkang"):
    hs = [h for h in hold if h["spk"] == spk]
    E = np.mean([emb(h["audio"]) for h in hs], 0); ref[spk] = dict(E=E / np.linalg.norm(E))
    ys = [load16(h["audio"]) for h in hs]
    ref[spk]["f0"] = float(np.median([f0med(y) for y in ys])); ref[spk]["rate"] = float(np.median([rate(y, h["text"]) for y, h in zip(ys, hs)]))
    sims = [float(emb(h["audio"]) @ ref[spk]["E"]) for h in hs]
    print(f"실제 {spk}: 닮음(자기 평균 대비) {np.median(sims):.3f}, F0 {ref[spk]['f0']:.0f}Hz, 속도 {ref[spk]['rate']:.1f}자/초")
for d in outs:
    log = json.load(open(d / "log.json")); asr = json.load(open(d / "asr.json")) if (d / "asr.json").exists() else {}
    rows = []
    for it in log["items"]:
        f = d / f"{it['spk']}_{it['id']}.wav"; y = load16(f); r = ref[it["spk"]]
        rows.append(dict(spk=it["spk"], id=it["id"], sim=float(emb(f) @ r["E"]), st=12 * np.log2(f0med(y) / r["f0"]), rate=rate(y, it["text"]),
                         cer=asr.get(f.name, {}).get("cer", float("nan")), rtf=it["rtf"]))
    json.dump(rows, open(d / "voice.json", "w"), ensure_ascii=False, indent=1)
    print(f"== {log['model']}")
    for spk in ("songi", "songkang"):
        rs = [x for x in rows if x["spk"] == spk]
        if not rs: continue
        m = lambda k, f=np.median: f([x[k] for x in rs])
        print(f"  {spk}: 닮음 {m('sim'):.3f}  피치 {m('st'):+.1f}반음  속도 {m('rate'):.1f}자/초  CER 중앙 {m('cer'):.3f} 최대 {m('cer', np.max):.3f}  RTF {m('rtf'):.2f}")
