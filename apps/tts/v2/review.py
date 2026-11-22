# 받아쓰기 검수 화면: python review.py clips_dir [port]  → http://127.0.0.1:8765
# 대본과 들린 말이 다른 클립만 보여 준다. 들으면서 실제로 한 말로 글을 고치거나, 다시 읽기·잘림이 있으면 뺀다. 저장은 clips_dir/review.json
import sys, json, html, pathlib, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
d = pathlib.Path(sys.argv[1]).resolve()
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
clips = json.load(open(d / "clips.json"))
todo = [c for c in clips if c["cer"] > 0 or c["dur"] < 0.8]
saved = json.load(open(d / "review.json")) if (d / "review.json").exists() else {}

def page():
    rows = []
    for c in todo:
        s = saved.get(c["id"], {})
        txt = s.get("text", c["script"])
        rows.append(f"""<div class=item data-id="{c['id']}">
<div class=head><b>{c['id']}</b> · {c['dur']}초 · 차이 {c['cer']:.2f}</div>
<audio controls preload=none src="/a/{c['id']}.wav"></audio>
<div class=row><span>대본</span><button type=button onclick="use(this,'script')">이걸로</button><q data-k=script>{html.escape(c['script'])}</q></div>
<div class=row><span>들림</span><button type=button onclick="use(this,'heard')">이걸로</button><q data-k=heard>{html.escape(c['heard'])}</q></div>
<textarea rows=2>{html.escape(txt)}</textarea>
<label><input type=checkbox class=drop {'checked' if s.get('drop') else ''}> 빼기 (다시 읽기·말 더듬음·잘림·잡음)</label>
</div>""")
    return f"""<!doctype html><meta charset=utf-8><title>받아쓰기 검수</title>
<style>body{{font:15px/1.5 -apple-system,sans-serif;max-width:860px;margin:0 auto;padding:16px;background:#fafafa}}
.item{{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}}.item.done{{border-color:#4a4}}
audio{{width:100%}}.row{{display:flex;gap:8px;align-items:baseline;margin:4px 0}}.row span{{color:#888;width:32px;flex:none}}
q{{quotes:none}}button{{font-size:12px}}textarea{{width:100%;font:16px/1.5 inherit;box-sizing:border-box;margin:6px 0}}
#bar{{position:sticky;top:0;background:#fafafa;padding:8px 0;display:flex;gap:12px;align-items:center;border-bottom:1px solid #ddd}}</style>
<div id=bar><button onclick=save()>저장</button><span id=msg>{len(todo)}개 · 이미 저장 {sum(1 for c in todo if c['id'] in saved)}개</span></div>
<p>클립을 듣고, 아래 칸을 <b>실제로 들린 말</b>로 맞춰 주세요(띄어쓰기·문장부호는 대충 괜찮습니다). 숫자는 한글로 적어 주세요(삼백 그램). 다시 읽었거나 말이 꼬였거나 앞뒤가 잘렸으면 '빼기'.</p>
{''.join(rows)}
<script>
function use(b,k){{const it=b.closest('.item');it.querySelector('textarea').value=it.querySelector('q[data-k='+k+']').textContent}}
document.addEventListener('play',e=>{{document.querySelectorAll('audio').forEach(a=>{{if(a!==e.target)a.pause()}});e.target.closest('.item').classList.add('done')}},true);
async function save(){{const out={{}};document.querySelectorAll('.item').forEach(it=>{{out[it.dataset.id]={{text:it.querySelector('textarea').value.trim(),drop:it.querySelector('.drop').checked,heard:it.classList.contains('done')}}}});
const r=await fetch('/save',{{method:'POST',body:JSON.stringify(out)}});document.getElementById('msg').textContent=r.ok?'저장됨 '+new Date().toLocaleTimeString():'저장 실패'}}
</script>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == "/":
            return self.send(200, page().encode(), "text/html; charset=utf-8")
        name = urllib.parse.unquote(self.path.removeprefix("/a/"))
        ids = {c["id"] for c in todo}
        if self.path.startswith("/a/") and name.endswith(".wav") and name[:-4] in ids:  # 목록에 있는 클립만
            return self.send(200, (d / name).read_bytes(), "audio/wav")
        self.send(404, b"", "text/plain")
    def do_POST(self):
        if self.path != "/save":
            return self.send(404, b"", "text/plain")
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        ids = {c["id"] for c in todo}
        saved.update({k: v for k, v in data.items() if k in ids})
        (d / "review.json").write_text(json.dumps(saved, ensure_ascii=False, indent=1))
        self.send(200, b"ok", "text/plain")

print(f"http://127.0.0.1:{port}  ({len(todo)}개)")
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
