# 검수 결과로 학습·홀드아웃 목록을 만든다: python dataset.py clips_dir  → clips_dir/{train,holdout}.jsonl
# 글: 숫자가 든 검수 글은 대본을 힌트로 다시 받아쓴 결과(fixed.json), 검수한 글, 대본 순
import sys, json, re, random, pathlib
d = pathlib.Path(sys.argv[1])
clips = json.load(open(d / "clips.json"))
rev = json.load(open(d / "review.json"))
fixed = json.load(open(d / "fixed.json"))
rows = []
for c in clips:
    r = rev.get(c["id"], {})
    if r.get("drop") or c["dur"] < 0.8 or c["id"] in fixed and fixed[c["id"]] is None:
        continue
    text = fixed.get(c["id"]) or r.get("text") or c["script"]
    assert not re.search(r"\d", text), (c["id"], text)
    rows.append(dict(id=c["id"], spk="songkang" if c["src"].startswith("송강") else "songi", audio=str((d / f"{c['id']}.wav").resolve()),
                     text=text, dur=c["dur"], clean=c["cer"] == 0 and c["id"] not in rev))
random.seed(7)
hold = set()
for spk in ("songi", "songkang"):
    cand = [r for r in rows if r["spk"] == spk and r["clean"] and 3 <= r["dur"] <= 10]
    hold |= {r["id"] for r in random.sample(cand, 12)}
for name, keep in (("train", lambda r: r["id"] not in hold), ("holdout", lambda r: r["id"] in hold)):
    with open(d / f"{name}.jsonl", "w") as f:
        for r in rows:
            if keep(r): f.write(json.dumps(r, ensure_ascii=False) + "\n")
for spk in ("songi", "songkang"):
    t = [r for r in rows if r["spk"] == spk and r["id"] not in hold]; h = [r for r in rows if r["spk"] == spk and r["id"] in hold]
    print(f"{spk}: 학습 {len(t)}개 {sum(r['dur'] for r in t)/60:.1f}분, 홀드아웃 {len(h)}개 {sum(r['dur'] for r in h)/60:.1f}분")
