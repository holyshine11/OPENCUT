# 지금 엔진(1세대, tts-web 7860)으로 같은 평가 문장을 합성: python baseline_v1.py out_dir clips_dir speed
import sys, json, time, pathlib, urllib.request, io, soundfile as sf
od, cd, speed = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), float(sys.argv[3])
od.mkdir(parents=True, exist_ok=True)
hold = [json.loads(l) for l in open(cd / "holdout.jsonl")]
extra = [l.strip() for l in open(pathlib.Path(__file__).parent / "evalset.txt") if l.strip()]
log = dict(model=f"gpt-sovits v1 @{speed}", items=[])
for spk, voice in (("songi", "송이"), ("songkang", "송강")):
    for iid, text in [(h["id"], h["text"]) for h in hold if h["spk"] == spk] + [(f"x{i:02d}", t) for i, t in enumerate(extra)]:
        body = dict(text=text, voice=voice, style="neutral", speed=speed, pause=0.3, question="…", format="wav", strength=50, expressiveness=50)
        t0 = time.time()
        with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:7860/synth", json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=900) as r:
            data = r.read()
        el = time.time() - t0
        y, sr = sf.read(io.BytesIO(data)); (od / f"{spk}_{iid}.wav").write_bytes(data)
        log["items"].append(dict(spk=spk, id=iid, text=text, sec=round(len(y) / sr, 2), gen_s=round(el, 2), rtf=round(el / (len(y) / sr), 2)))
        print(spk, iid, log["items"][-1]["rtf"], flush=True)
json.dump(log, open(od / "log.json", "w"), ensure_ascii=False, indent=1)
