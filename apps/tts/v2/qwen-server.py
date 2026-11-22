# 2세대 합성 서버 (Qwen3-TTS 미세조정 모델, MLX). tts-web.sh 가 v2/.venv 로 켠다: python qwen-server.py host port
# POST /tts {"model": "models/qwen/songi"(apps/tts 기준), "speaker": "songi", "text": "..."} → 24kHz 16bit WAV
# POST /asr 16kHz 16bit WAV → {"text": "..."} (발음 검사, Whisper large-v3-turbo MLX — 처음 쓸 때 Hugging Face 에서 받는다)
# 모델은 처음 쓸 때 읽어 두고(목소리마다 약 1GB) 요청은 한 번에 하나씩 처리한다
import io, os, re, sys, json, wave, numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASR_REPO = os.environ.get("TTS_QWEN_ASR_MODEL", "mlx-community/whisper-large-v3-turbo")
_models = {}


def model(path):
    full = os.path.realpath(os.path.join(HERE, path))
    if not full.startswith(os.path.join(HERE, "models") + os.sep) or not os.path.exists(os.path.join(full, "config.json")):
        raise FileNotFoundError(f"모델이 없습니다: {path}")
    if full not in _models:
        from mlx_audio.tts.utils import load_model
        _models[full] = load_model(full)
    return _models[full]


def synth(path, speaker, text):
    # 끝없이 이어 말하는 실패를 막는 토큰 상한 (12.5 토큰/초, 실제 말은 6자/초 안팎 → 글자당 4토큰이면 2배 여유)
    cap = len(re.findall("[가-힣0-9A-Za-z]", text)) * 4 + 30
    res = list(model(path).generate_custom_voice(text=text, speaker=speaker, language="auto", max_tokens=cap))
    y = np.concatenate([np.asarray(r.audio, dtype=np.float32) for r in res])
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(res[0].sample_rate)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def asr(data):
    import mlx_whisper
    with wave.open(io.BytesIO(data)) as w:
        if w.getframerate() != 16000 or w.getsampwidth() != 2 or w.getnchannels() != 1:
            raise ValueError("16kHz 16bit 모노 WAV 만 받습니다")
        y = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return mlx_whisper.transcribe(y, path_or_hf_repo=ASR_REPO, language="ko", condition_on_previous_text=False)["text"]


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data, ctype):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200, b"ok", "text/plain")

    def do_POST(self):
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if self.path == "/asr":
                return self.reply(200, json.dumps({"text": asr(body)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            req = json.loads(body)
            text = str(req["text"]).strip()
            if not text:
                raise ValueError("text 가 비었습니다")
            self.reply(200, synth(str(req["model"]), str(req["speaker"]), text), "audio/wav")
        except (ValueError, KeyError, TypeError, FileNotFoundError, EOFError, wave.Error) as e:
            self.reply(400, str(e).encode(), "text/plain; charset=utf-8")
        except Exception as e:  # 합성 중 오류도 연결을 끊지 않고 알려 준다
            self.reply(500, f"{type(e).__name__}: {e}".encode(), "text/plain; charset=utf-8")


if __name__ == "__main__":
    HTTPServer((sys.argv[1], int(sys.argv[2])), Handler).serve_forever()
