# 대본 문장을 받아쓰기 낱말 타임스탬프에 맞춘다: python align.py asr.json scripts_dir out.json
# 대본과 실제로 읽은 말이 다른 문장(애드리브·빠뜨림·받아쓰기 오류)은 cer 로 드러나 검수 대상이 된다
import sys, re, json, ast, difflib, unicodedata, pathlib
src = pathlib.Path(__file__).resolve().parent.parent / "tts-web.py"
tree = ast.parse(src.read_text())
keep = {"syllables", "sino", "native", "number_words", "number_range", "normalize", "cer"}
code = "".join(ast.get_source_segment(src.read_text(), n) + "\n" for n in tree.body
               if (isinstance(n, ast.FunctionDef) and n.name in keep) or
               (isinstance(n, ast.Assign) and any(getattr(t, "id", "") in {"SINO", "NATIVE_ONES", "NATIVE_TENS", "NATIVE_COUNTERS", "SINO_EXCEPTIONS", "RANGE_COUNTERS", "UNITS", "LETTERS"} for t in n.targets)))
g = {"re": re, "unicodedata": unicodedata}
exec(code, g)
norm = lambda s: g["syllables"](g["normalize"](s))

if __name__ == "__main__":
    asr, sdir, out = json.load(open(sys.argv[1])), pathlib.Path(sys.argv[2]), sys.argv[3]
    res = {}
    for name, segs in asr.items():
        words = [w for s in segs for w in s["w"]]
        heard_all = norm("".join(w[0] for w in words))
        # 녹음 순서와 대본 번호가 다를 수 있어(송이2 = 대본 3) 가장 많이 겹치는 대본을 고른다
        script = max(sorted(sdir.glob("*.txt")), key=lambda f: difflib.SequenceMatcher(None, norm(f.read_text()), heard_all, autojunk=False).ratio())
        sents = [s for s in script.read_text().split("\n") if s.strip()]
        hc, hw = [], []  # 받아쓴 글자와 그 글자의 낱말 번호
        for i, w in enumerate(words):
            for ch in norm(w[0]):
                hc.append(ch); hw.append(i)
        rc, rs = [], []  # 대본 글자와 그 글자의 문장 번호
        for i, s in enumerate(sents):
            for ch in norm(s):
                rc.append(ch); rs.append(i)
        sm = difflib.SequenceMatcher(None, rc, hc, autojunk=False)
        r2h = {}
        for a, b, n in sm.get_matching_blocks():
            for k in range(n):
                r2h[a + k] = b + k
        rows, used = [], set()
        for i, s in enumerate(sents):
            idx = [r2h[k] for k in range(len(rc)) if rs[k] == i and k in r2h]
            if not idx:
                rows.append(dict(i=i, text=s, s=None, e=None, heard="", cer=1.0)); continue
            w0, w1 = hw[min(idx)], hw[max(idx)]
            used.update(range(w0, w1 + 1))
            heard = "".join(w[0] for w in words[w0:w1 + 1]).strip()
            rows.append(dict(i=i, text=s, s=words[w0][1], e=words[w1][2], heard=heard,
                             cer=round(g["cer"](norm(s), norm(heard)), 3),
                             minp=min(w[3] for w in words[w0:w1 + 1])))
        extra = [w for k, w in enumerate(words) if k not in used]
        res[name] = dict(script=script.name, sentences=rows, unmatched_words=extra)
        bad = [r for r in rows if r["cer"] > 0]
        print(f"{name} ← {script.name}: 문장 {len(rows)}, 대본과 다름 {len(bad)}, 대본에 없는 낱말 {len(extra)}")
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
