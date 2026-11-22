# 블라인드 청취: python listen.py [port]  → http://127.0.0.1:8766
# 문장마다 실제 녹음 / 1세대 / 2세대를 이름 없이 섞어 들려 준다. 결과는 data/p3/listen.json, 다 고른 뒤 '정답 보기'
import sys, json, random, pathlib, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
root = pathlib.Path(__file__).resolve().parent.parent / "data"
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
V2 = {"songi": "p3/songi06l_e8_q8", "songkang": "p3/songkang06l_e10_q8"}
hold = [json.loads(l) for l in open(root / "clips_fa/holdout.jsonl")]
extra = [l.strip() for l in open(root.parent / "v2/evalset.txt") if l.strip()]
random.seed(11); items = []
for spk in ("songi", "songkang"):
    rows = [(h["id"], h["text"], f"clips_fa/{h['id']}.wav") for h in hold if h["spk"] == spk] + [(f"x{i:02d}", t, None) for i, t in enumerate(extra)]
    for iid, text, real in rows:
        opts = [("1세대", f"p3/v1_1.2/{spk}_{iid}.wav"), ("2세대", f"{V2[spk]}/{spk}_{iid}.wav")] + ([("실제", real)] if real else [])
        opts = [o for o in opts if (root / o[1]).exists()]; random.shuffle(opts)
        items.append(dict(key=f"{spk}_{iid}", spk="송이" if spk == "songi" else "송강", text=text, opts=opts))
allowed = {o[1] for it in items for o in it["opts"]}
out = root / "p3/listen.json"
saved = json.load(open(out)) if out.exists() else {}
def page():
    blocks = []
    for it in items:
        s = saved.get(it["key"], {})
        opts = "".join(f"""<div class=opt><b>{chr(65 + k)}</b><audio controls preload=none src="/a/{urllib.parse.quote(p)}"></audio>
<label><input type=radio name="best_{it['key']}" value="{chr(65 + k)}" {'checked' if s.get('best') == chr(65 + k) else ''}> 가장 자연스러움</label>
<label><input type=checkbox class=real value="{chr(65 + k)}" {'checked' if chr(65 + k) in s.get('real', []) else ''}> 실제 녹음 같다</label>
<span class=ans hidden>{name}</span></div>""" for k, (name, p) in enumerate(it["opts"]))
        blocks.append(f"<div class=item data-key='{it['key']}'><div class=head>{it['spk']} · {it['text']}</div>{opts}</div>")
    return f"""<!doctype html><meta charset=utf-8><title>목소리 블라인드 청취</title>
<style>body{{font:15px/1.5 -apple-system,sans-serif;max-width:900px;margin:0 auto;padding:16px;background:#fafafa}}.item{{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}}
.head{{font-weight:600;margin-bottom:6px}}.opt{{display:flex;gap:10px;align-items:center;margin:4px 0;flex-wrap:wrap}}audio{{width:300px;max-width:100%}}.ans{{color:#c40;font-weight:600}}
#bar{{position:sticky;top:0;background:#fafafa;padding:8px 0;display:flex;gap:12px;border-bottom:1px solid #ddd}}</style>
<div id=bar><button onclick=save()>저장</button><button onclick=reveal()>정답 보기</button><span id=msg></span></div>
<p>문장마다 2~3개 음성이 섞여 있습니다(실제 녹음이 있는 문장과 없는 문장). 각 문장에서 <b>가장 자연스러운 것</b> 하나를 고르고, <b>실제 녹음 같다</b>고 느끼는 것에 모두 체크해 주세요. 다 고른 뒤 저장하고 '정답 보기'.</p>
{''.join(blocks)}
<script>
document.addEventListener('play',e=>document.querySelectorAll('audio').forEach(a=>{{if(a!==e.target)a.pause()}}),true);
async function save(){{const o={{}};document.querySelectorAll('.item').forEach(it=>{{const b=it.querySelector('input[type=radio]:checked');o[it.dataset.key]={{best:b?b.value:null,real:[...it.querySelectorAll('.real:checked')].map(x=>x.value)}}}});
const r=await fetch('/save',{{method:'POST',body:JSON.stringify(o)}});document.getElementById('msg').textContent=r.ok?'저장됨 '+new Date().toLocaleTimeString():'저장 실패'}}
function reveal(){{document.querySelectorAll('.ans').forEach(x=>x.hidden=false)}}
</script>"""
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, c, b, t):
        self.send_response(c); self.send_header("Content-Type", t); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/": return self.send(200, page().encode(), "text/html; charset=utf-8")
        p = urllib.parse.unquote(self.path.removeprefix("/a/"))
        if self.path.startswith("/a/") and p in allowed: return self.send(200, (root / p).read_bytes(), "audio/wav")
        self.send(404, b"", "text/plain")
    def do_POST(self):
        if self.path != "/save": return self.send(404, b"", "text/plain")
        d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        saved.update({k: v for k, v in d.items() if k in {i["key"] for i in items}})
        out.write_text(json.dumps(dict(saved, _answers={i["key"]: {chr(65 + k): n for k, (n, _) in enumerate(i["opts"])} for i in items}), ensure_ascii=False, indent=1))
        self.send(200, b"ok", "text/plain")
print(f"http://127.0.0.1:{port}  ({len(items)}문장)")
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
