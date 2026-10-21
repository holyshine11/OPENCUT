# 웹 테스트 화면 서버. tts-web.sh 가 tts.env 를 읽어 실행하며, 글을 문장 단위로 나눠 합성 서버에 보내고(문장마다 발음 검사·재생성),
# 문장 사이 쉼을 넣어 이어 붙인 뒤 ffmpeg 로 후처리(TTS_POST_FILTER)와 MP3/M4A/WAV 인코딩을 해서 돌려준다. 화면은 tts-web.html 한 파일.
import os, re, io, sys, glob, json, time, wave, select, socket, subprocess, tempfile, threading, unicodedata, urllib.request, urllib.error, urllib.parse, http.client
import yaml
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import numpy as np

env = os.environ
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "tts-web.html")
SERVER = env["TTS_API_URL"].removesuffix("/tts")  # 합성 서버 하나가 목소리마다 가중치를 갈아 끼운다
lo, hi, step = map(float, env["TTS_WEB_SPEED_RANGE"].split())
pause_lo, pause_hi, pause_step = map(float, env["TTS_WEB_PAUSE_RANGE"].split())
MAX_CHARS = int(env["TTS_WEB_MAX_CHARS"])
FILENAME_WORDS = int(env["TTS_WEB_FILENAME_WORDS"])
QUESTION_ENDS = (".", ",", "…", "?")
# 형식별 (ffmpeg 인코더, 출력 옵션, 출력 컨테이너, Content-Type)
FORMATS = {
    "mp3": ("libmp3lame", ["-b:a", env["TTS_MP3_BITRATE"], "-ar", env["TTS_OUT_RATE"]], "mp3", "audio/mpeg"),
    "m4a": ("aac", ["-b:a", env["TTS_AAC_BITRATE"], "-ar", env["TTS_OUT_RATE"]], "ipod", "audio/mp4"),
    "wav": ("pcm_s16le", ["-ar", env["TTS_WAV_SAMPLE_RATE"]], "wav", "audio/wav"),
}
REQUEST_FIELDS = {"text", "voice", "style", "speed", "pause", "question", "format", "strength", "expressiveness"}
PERCENT = 100  # 감정 강도·표현력 슬라이더 눈금 (0–100)
# 표현력 0·50·100 에서의 GPT top_k (사이는 직선으로 잇는다). 50 은 합성 서버 기본값과 같게 둔다
TOPK_POINTS = [float(x) for x in env["TTS_WEB_TOPK_POINTS"].split()]
MAX_BODY = 1 << 20  # 요청 본문 최대 크기

# 문장 나누기·이어 붙이기 (tts.env 설명 참고)
SEG_MAX_CHARS = int(env.get("TTS_WEB_SEG_MAX_CHARS", 60))
SEG_MIN_SYL = int(env.get("TTS_WEB_SEG_MIN_SYL", 6))
LEAD_MAX, TAIL_MAX = float(env.get("TTS_WEB_LEAD_MAX", 0.3)), float(env.get("TTS_WEB_TAIL_MAX", 0.25))
PAUSE_RATIO = {"sentence": 1.0, "comma": float(env.get("TTS_WEB_PAUSE_COMMA_RATIO", 0.4)), "para": float(env.get("TTS_WEB_PAUSE_PARA_RATIO", 2))}
# 발음 검사·재생성
ASR_CHECK = env.get("TTS_WEB_ASR_CHECK", "1") != "0"
ASR_MODEL = env["TTS_WEB_ASR_MODEL"]
ASR_MAX_CER = float(env.get("TTS_WEB_ASR_MAX_CER", 0.3))
RATE_LO, RATE_HI = map(float, env.get("TTS_WEB_RATE_RANGE", "2.0 9.0").split())
RETRIES = int(env.get("TTS_WEB_RETRIES", 2))
SYNTH_TIMEOUT = float(env.get("TTS_WEB_SYNTH_TIMEOUT", 180))
PING_TIMEOUT = float(env["TTS_WEB_PING_TIMEOUT"])
SENT_END = ".!?…。！？"
SILENCE_DB = -45  # 이보다 작으면 정적으로 본다 (dBFS)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def here(p):
    """apps/tts 폴더 기준 경로 → 절대 경로. 합성 서버는 GPT-SoVITS 폴더에서 돌아서 보내는 경로도 절대 경로여야 한다"""
    return os.path.join(HERE, p)


class Bad(Exception):
    """사용자에게 그대로 보여줄 오류 (HTTP 상태, 메시지)"""

    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status


def voices():
    """목소리 목록 (TTS_VOICES_FILE, 첫 항목이 기본). 각 목소리의 감정 목록을 styles 로 붙이고, 그 안의 음성 경로를 절대 경로로 바꾼다."""
    with open(here(env["TTS_VOICES_FILE"]), encoding="utf8") as f:
        vs = json.load(f)
    for v in vs:
        with open(here(v["styles_file"]), encoding="utf8") as f:
            v["styles"] = json.load(f)
        for s in v["styles"]:
            prm = s.get("params", {})
            if "ref_audio_path" in prm:
                prm["ref_audio_path"] = here(prm["ref_audio_path"])
            if "aux_ref_audio_paths" in prm:
                prm["aux_ref_audio_paths"] = [here(a) for a in prm["aux_ref_audio_paths"]]
            if "style_aux" in s:
                s["style_aux"] = [here(a) for a in s["style_aux"]]
    return vs


def presets():
    """스타일 프리셋 (TTS_WEB_PRESETS_FILE, 첫 항목이 처음 화면 값). 목소리에 없는 말투는 화면에서 기본으로 바뀐다."""
    with open(here(env["TTS_WEB_PRESETS_FILE"]), encoding="utf8") as f:
        return json.load(f)


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ---- 글 다듬기와 문장 나누기 ----
def syllables(text):
    """읽히는 글자 수 (한글·숫자·영문만). 말 속도 계산과 발음 검사(CER)에 쓴다"""
    return re.sub(r"[^0-9A-Za-z가-힣]", "", text)


# ---- 숫자 읽기 ----
# 합성 서버(g2pk2)는 숫자가 단위에 바로 붙고 형태소 분석기가 그 단위를 의존명사로 볼 때만 수를 읽고, 그 밖에는 자릿수대로 읽는다
# ("10-15분" → 일영-십오분, "12 개" → 일이 개, "12인분" → 일이인분). 영문 단위가 붙으면 영어로 읽는다 ("15.5kg" → fifteen point five).
# 그래서 숫자는 여기서 모두 한글로 바꿔 보낸다 (측정·감사 2026-10-08)
SINO = "영일이삼사오육칠팔구"
NATIVE_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"]
NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"]
# 고유어 수사로 세는 단위 (99 까지). 나머지 단위와 단위 없는 수는 한자어 수사
NATIVE_COUNTERS = ("시간 번째 켤레 큰술 작은술 숟가락 스푼 봉지 조각 접시 그릇 사람 가지 군데 모금 방울 꼬집 "
                   "개 명 살 시 번 마리 권 잔 컵 병 장 대 벌 그루 송이 줄 알 포기 쪽 통 판 달 톨 줌").split()
# 고유어 단위로 시작하지만 한자어로 세는 말 (10달러 → 십달러, 3개월 → 삼개월)
SINO_EXCEPTIONS = tuple("달러 개월 개국 개년 개소 번지 시즌".split())
# 범위(3~4인분)에서 앞 숫자에도 붙여 줄 단위
RANGE_COUNTERS = NATIVE_COUNTERS + "인분 분 초 일 년 월 주 배 회 원 층 학년 도 퍼센트 그램 킬로그램 킬로미터 미터 센티미터 밀리리터 리터".split()
UNITS = [(r"kg", "킬로그램"), (r"mg", "밀리그램"), (r"g", "그램"), (r"km", "킬로미터"), (r"cm", "센티미터"), (r"mm", "밀리미터"), (r"m", "미터"),
         (r"ml|mL|cc", "밀리리터"), (r"l|L", "리터"), (r"℃|°C", "도"), (r"%", "퍼센트")]
LETTERS = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "에이 비 시 디 이 에프 지 에이치 아이 제이 케이 엘 엠 엔 오 피 큐 알 에스 티 유 브이 더블유 엑스 와이 제트".split()))


def sino(digits):
    """한자어 수사: '2024' → 이천이십사. 만·억·조 단위로 끊어 읽고 '일십·일백·일천·일만' 의 '일' 은 뺀다"""
    n = int(digits)
    if n == 0:
        return "영"
    out, big = [], ["", "만", "억", "조"]
    for i in range(4):
        part, n = n % 10000, n // 10000
        if part:
            s = ""
            for d, unit in zip(f"{part:04d}", ["천", "백", "십", ""]):
                if d != "0":
                    s += ("" if d == "1" and unit else SINO[int(d)]) + unit
            out.append(s + big[i])
    if out[-1] == "일만":  # 만오천원 (일억·일조는 그대로)
        out[-1] = "만"
    return "".join(reversed(out))


def native(n, counter):
    """고유어 수사(단위 앞 꼴): 1 → 한, 20 → 스무, 21 → 스물한"""
    if n == 20:
        return "스무"
    if n == 1 and counter == "번째":
        return "첫"
    return NATIVE_TENS[n // 10] + NATIVE_ONES[n % 10]


def number_words(m):
    """'3개' → 세 개, '10분' → 십분, '15.5' → 십오점오, '6월' → 유월, '제 1장' → 제 일장"""
    num, frac, space, after = m.group(1), m.group(2), m.group(3), m.group(4) or ""
    if frac is not None:
        return sino(num) + "점" + "".join(SINO[int(d)] for d in frac) + space + after
    if after.startswith("월") and num in ("6", "10"):
        return {"6": "유", "10": "시"}[num] + after
    ordinal = re.search(r"(?<![가-힣])제 ?$", m.string[:m.start()]) is not None  # '제 1장' 은 한자어 ('문제 3개' 는 아님)
    counter = next((c for c in NATIVE_COUNTERS if after.startswith(c)), None)
    if counter and not ordinal and not after.startswith(SINO_EXCEPTIONS) and 1 <= int(num) <= 99:
        return native(int(num), counter) + " " + after
    if num == "1" and after.startswith(("만", "천", "백", "십")) and not space:  # 1만 원 → 만 원
        return after
    return sino(num) + space + after


def number_range(m):
    """'3~4인분' → 3인분에서 4인분, '10-15분 정도' → 10분에서 15분 정도, '15분~20분' 도 같다 (숫자는 그 다음 단계에서 한글로)"""
    a, c1, b, after = m.group(1), m.group(2) or "", m.group(3), m.group(4) or ""
    counter = c1 or next((c for c in RANGE_COUNTERS if after.startswith(c)), "")
    return f"{a}{counter}에서 {b}{after}"


def normalize(text):
    """합성 서버의 한국어 전처리가 잘못 읽는 표기를 미리 고친다 (감사 결과: tts.env 설명).
    글자가 아닌 기호는 모델에서 짧은 멈춤(停)이 되거나 [ ] 처럼 다른 언어의 기호로 쓰이므로 뜻이 없는 것은 지운다"""
    text = unicodedata.normalize("NFC", text).replace("\t", " ").replace("\r", "").replace("　", " ")
    text = re.sub(r"[​-‍﻿]", "", text)
    text = re.sub(r"\.{2,}|‥", "…", text)  # ... → 말줄임표 (서버는 연속 부호를 하나로 줄이므로 미리 바꾼다)
    text = re.sub(r"[\"“”‘’'「」『』《》〈〉«»]", "", text)  # 따옴표는 지우고 내용만
    text = re.sub(r"[()\[\]（）［］{}]", " ", text)  # 괄호는 띄어쓰기로
    text = re.sub(r"[ㄱ-ㅎㅏ-ㅣ]+", "", text)  # ㅋㅋ ㅎㅎ ㅠㅠ 같은 낱자는 소리가 깨지거나 사라진다
    text = re.sub(r"(?<=\d),(?=\d{3})", "", text)  # 1,250 → 1250
    # 한글도 \w 라서 \b 가 숫자와 한글 사이에서 걸리지 않으므로 숫자 경계는 (?<!\d) (?!\d) 로 본다
    text = re.sub(r"(?<!\d)(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)", r"\1년 \2월 \3일", text)
    text = re.sub(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", lambda m: f"{m.group(1)}시" + ("" if m.group(2) == "00" else f" {m.group(2)}분"), text)
    text = re.sub(r"(?<!\d)(\d{2,4})-(\d{3,4})-(\d{4})(?!\d)", lambda m: ", ".join("".join("공" if d == "0" else SINO[int(d)] for d in g) for g in m.groups()), text)
    text = re.sub(r"(?<!\d)1/2(?!\d)", "반", text)
    text = re.sub(r"(?<!\d)(\d+)/(\d+)(?!\d)", r"\2분의 \1", text)
    text = re.sub(r"[₩￦]\s?(\d+)", r"\1원", text)
    text = re.sub(r"\$\s?(\d+)", r"\1달러", text)
    for pat, ko in UNITS:
        text = re.sub(rf"(?<=\d)\s?(?:{pat})(?![A-Za-z])", ko, text)
    text = re.sub(r"(?<=\d)(?=[A-Za-z])|(?<=[A-Za-z])(?=\d)", " ", text)  # 숫자와 영문이 붙어 있으면 영어로 읽히므로 띄운다 (3D → 3 D)
    text = re.sub(r"(\d+)(" + "|".join(RANGE_COUNTERS) + r")?\s*[~〜～\-–—]\s*(\d+)\s?([가-힣]+)?", number_range, text)
    text = re.sub(r"(\d+)(?:\.(\d+))?( ?)([가-힣]*)", number_words, text)  # 남은 숫자는 모두 한글로
    text = re.sub(r"(?<![A-Za-z])([A-Z]{1,5})(?![A-Za-z])", lambda m: "".join(LETTERS[ch] for ch in m.group(1)), text)  # TV → 티브이, AI → 에이아이
    text = re.sub(r"[~〜～]", "", text)  # 안녕~ → 안녕 (끝의 ~ 는 서버가 마침표를 붙이지 못하게 한다)
    text = re.sub(r"[—–]+|\s-\s", ", ", text)  # 줄표는 쉼으로
    text = re.sub(r"[;:/·]", ", ", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    text = re.sub(r"\s+([.!?…])", r"\1", text)
    return "\n".join(line.strip(" ,") for line in text.split("\n"))


def split_long(sentence):
    """SEG_MAX_CHARS 보다 긴 문장은 가운데에 가까운 쉼표(없으면 띄어쓰기)에서 둘로 나눈다 (재귀)"""
    if len(sentence) <= SEG_MAX_CHARS:
        return [sentence]
    mid = len(sentence) / 2
    for pat in (r",\s", r"\s"):
        cuts = [m.end() for m in re.finditer(pat, sentence)]
        cuts = [c for c in cuts if len(syllables(sentence[:c])) >= SEG_MIN_SYL and len(syllables(sentence[c:])) >= SEG_MIN_SYL]
        if cuts:
            c = min(cuts, key=lambda c: abs(c - mid))
            return split_long(sentence[:c].strip()) + split_long(sentence[c:].strip())
    return [sentence]


def segments(text):
    """글 → [(문장, 뒤 쉼 종류)]. 줄바꿈은 문단(para), 문장 끝 부호 뒤는 sentence, 긴 문장을 쉼표에서 나눈 조각 뒤는 comma.
    짧은 문장(SEG_MIN_SYL 음절 미만)은 다음 문장에 붙여 모델이 그 사이 쉼을 스스로 정하게 한다 (아주 짧은 글은 합성이 불안정하다)"""
    out = []
    for para in [p for p in text.split("\n") if syllables(p)]:
        sents = [s.strip() for s in re.findall(rf"[^{SENT_END}]+[{SENT_END}]*", para) if syllables(s)]
        merged = []
        for s in sents:
            if merged and len(syllables(merged[-1])) < SEG_MIN_SYL:
                merged[-1] += " " + s
            else:
                merged.append(s)
        if len(merged) > 1 and len(syllables(merged[-1])) < SEG_MIN_SYL:
            merged[-2:] = [merged[-2] + " " + merged[-1]]
        for s in merged:
            parts = split_long(s)
            out += [(p, "comma") for p in parts[:-1]] + [(parts[-1], "sentence")]
        out[-1] = (out[-1][0], "para")
    return out


def build_body(req):
    raw = str(req.get("text", "")).strip()
    if len(raw) > MAX_CHARS:  # 다듬기 전 길이로 본다 (숫자를 한글로 풀면 길어진다)
        raise Bad(400, f"문장이 너무 깁니다. {MAX_CHARS}자 이내로 줄여 주세요. (지금 {len(raw)}자)")
    text = normalize(raw)
    if not syllables(text):
        raise Bad(400, "읽을 문장을 입력하세요." if not raw else "읽을 글자가 없습니다 (문장 부호나 기호만 있습니다).")
    speed = req.get("speed")
    if not is_number(speed) or not lo <= speed <= hi:
        raise Bad(400, f"속도는 {lo}–{hi} 사이여야 합니다.")
    pause = req.get("pause")
    if not is_number(pause) or not pause_lo <= pause <= pause_hi:
        raise Bad(400, f"문장 사이 쉼은 {pause_lo}–{pause_hi}초 사이여야 합니다.")
    q = req.get("question")
    if q not in QUESTION_ENDS:
        raise Bad(400, "물음표 끝음 값이 올바르지 않습니다.")
    voice = next((v for v in voices() if v["name"] == req.get("voice")), None)
    if voice is None:
        raise Bad(400, f"'{req.get('voice')}' 목소리를 찾을 수 없습니다. 페이지를 새로 고쳐 주세요.")
    style = next((s for s in voice["styles"] if req.get("style") in (s.get("id"), s["name"])), None)
    if style is None:
        raise Bad(400, f"'{req.get('style')}' 말투를 찾을 수 없습니다. 페이지를 새로 고쳐 주세요.")
    strength = req.get("strength", PERCENT)  # 없으면 예전처럼 말투를 최대로
    if not is_number(strength) or not 0 <= strength <= PERCENT:
        raise Bad(400, f"감정 강도는 0–{PERCENT} 사이여야 합니다.")
    expr = req.get("expressiveness")
    if expr is not None and (not is_number(expr) or not 0 <= expr <= PERCENT):
        raise Bad(400, f"표현력은 0–{PERCENT} 사이여야 합니다.")
    with open(here(env["TTS_REF_TEXT_FILE"]), encoding="utf8") as f:
        prompt = f.read().strip()
    # 문장은 하나씩 통째로(cut0) 보내고 쉼은 이어 붙일 때 넣는다 — 쉼표마다 잘라 따로 합성하면 억양이 끊겨 어색하다
    body = dict(text_lang=env["TTS_LANG"], prompt_lang=env["TTS_LANG"], ref_audio_path=here(env["TTS_REF_AUDIO"]), prompt_text=prompt,
                aux_ref_audio_paths=[here(a) for a in env["TTS_AUX_REFS"].split()], speed_factor=speed, fragment_interval=0, text_split_method="cut0")
    body.update(style.get("params", {}))
    # 감정 강도 = 보조 참조 음성 중 말투 클립의 비율. 합성 서버는 참조 음성들의 음색 벡터를 평균하므로
    # 기본 말투 클립을 말투 클립으로 하나씩 바꿀수록 그 말투 쪽으로 옮겨 간다 (0 = 기본 말투와 같음)
    if style.get("style_aux"):
        base = voice["styles"][0]["params"]["aux_ref_audio_paths"]
        k = round(strength / PERCENT * len(style["style_aux"]))
        body["aux_ref_audio_paths"] = style["style_aux"][:k] + base[:len(base) - k]
    if expr is not None:
        x = expr / PERCENT * (len(TOPK_POINTS) - 1)
        i = min(int(x), len(TOPK_POINTS) - 2)
        body["top_k"] = round(TOPK_POINTS[i] + (TOPK_POINTS[i + 1] - TOPK_POINTS[i]) * (x - i))
    # 세부 설정 값(숫자)은 보내온 것만 그대로 넘긴다
    body.update({k: v for k, v in req.items() if k not in REQUEST_FIELDS and is_number(v)})
    # 물음표는 문장을 나눈 뒤에 바꾼다 (","로 바꾸면 문장 경계가 사라지므로)
    segs = [(re.sub("[?？]", q, s), kind, pause * PAUSE_RATIO[kind]) for s, kind in segments(text)]
    return raw, voice, body, segs


# ---- 합성 서버 ----
def reachable(url):
    try:
        with urllib.request.urlopen(url, timeout=PING_TIMEOUT):
            pass
    except urllib.error.HTTPError:
        pass  # 404 라도 응답하면 켜진 것
    except (urllib.error.URLError, OSError, http.client.HTTPException):
        return False
    return True


_server_lock = threading.RLock()  # 한 요청의 문장들을 다 만들 때까지 다른 요청이 목소리를 바꾸지 못하게 do_POST 도 잡는다


def call_server(req):
    try:
        return urllib.request.urlopen(req, timeout=SYNTH_TIMEOUT).read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf8", "replace")
        raise Bad(502, f"합성 서버가 오류를 돌려줬습니다 ({e.code}): {detail}")
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:  # 연결 거부·끊김·시간 초과
        if isinstance(getattr(e, "reason", e), TimeoutError):
            raise Bad(504, f"합성 서버가 {SYNTH_TIMEOUT:.0f}초 안에 답하지 않았습니다. 문장을 줄이거나 서버 로그를 확인하세요.")
        raise Bad(503, f"합성 서버에 연결할 수 없습니다 ({getattr(e, 'reason', e)}). 서버가 켜져 있는지 확인하세요: ./tts-server.sh")


def load_weights(voice):
    """합성 서버(하나)에 그 목소리의 가중치가 올라가 있지 않으면 갈아 끼운다.
    지금 올라간 가중치는 서버가 바꿀 때마다 다시 쓰는 설정 파일(TTS_SERVER_CONFIG)에서 읽는다"""
    with open(here(env["TTS_SERVER_CONFIG"]), encoding="utf8") as f:
        now = yaml.safe_load(f)["custom"]
    for key, loaded, endpoint in (("gpt_weights", "t2s_weights_path", "set_gpt_weights"), ("sovits_weights", "vits_weights_path", "set_sovits_weights")):
        path = voice[key]
        if now[loaded] == path:
            continue
        # 서버는 파일을 읽기 전에 설정 파일부터 고친다 — 없는 파일이면 보내기 전에 막는다
        if not os.path.exists(os.path.join(HERE, "GPT-SoVITS", path)):
            raise Bad(500, f"'{voice['name']}' 목소리 가중치 파일이 없습니다: GPT-SoVITS/{path}")
        call_server(f"{SERVER}/{endpoint}?" + urllib.parse.urlencode({"weights_path": path}))


def synthesize(voice, body):
    # 가중치를 바꾸고 합성하는 사이에 다른 요청이 목소리를 바꾸지 못하게 묶는다
    with _server_lock:
        load_weights(voice)
        return call_server(urllib.request.Request(f"{SERVER}/tts", json.dumps(body).encode(), {"Content-Type": "application/json"}))


# ---- 소리 다루기 (32kHz 모노 16bit) ----
def read_wav(data):
    with wave.open(io.BytesIO(data)) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768, w.getframerate()


def write_wav(y, sr):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def speech_span(y, sr):
    """소리가 나는 구간 (시작 샘플, 끝 샘플, 소리 나는 시간 초). 20ms 단위 RMS 가 SILENCE_DB 보다 큰 곳"""
    n = int(sr * 0.02)
    frames = y[: len(y) // n * n].reshape(-1, n)
    db = 10 * np.log10((frames ** 2).mean(1) + 1e-12)
    idx = np.flatnonzero(db > SILENCE_DB)
    if len(idx) == 0:
        return 0, 0, 0.0
    return idx[0] * n, min(len(y), (idx[-1] + 1) * n), len(idx) * n / sr


_asr, _asr_lock = None, threading.Lock()


def transcribe(y, sr):
    """Whisper 로 받아 적기 (모델은 처음 쓸 때 한 번 읽는다)"""
    global _asr
    from scipy.signal import resample_poly
    y16 = resample_poly(y, 16000, sr).astype(np.float32) if sr != 16000 else y
    with _asr_lock:
        if _asr is None:
            from faster_whisper import WhisperModel
            _asr = WhisperModel(here(ASR_MODEL), device="cpu", compute_type="int8")
        segs, _ = _asr.transcribe(y16, language=env["TTS_LANG"], beam_size=5, without_timestamps=True, condition_on_previous_text=False)
        return "".join(s.text for s in segs)


def cer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        p, d[0] = d[0], i
        for j, hc in enumerate(hyp, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (rc != hc))
    return d[-1] / max(1, len(ref))


def synth_segment(voice, body, text):
    """문장 하나를 합성하고 검사한다. 조음 속도(쉼을 뺀 소리 나는 시간 기준)가 범위 밖이거나(웅얼거림·글자 빠짐)
    받아 적은 글이 많이 다르면(뭉개짐·헛소리) 다시 만들고, 가장 나은 것을 고른다. 받아 적기 자체가 흔들리므로 글자 2개(짧은 문장은 3개)까지는 봐준다.
    돌려주는 값: (소리, 샘플링 주파수, 다시 만든 횟수, 고른 것의 CER)"""
    best, attempts = None, 0
    ref = syllables(text)
    tolerance = max(3 if len(ref) < 10 else 2, ASR_MAX_CER * len(ref))  # 허용 글자 오류 수
    for attempt in range(1 + RETRIES):
        y, sr = read_wav(synthesize(voice, dict(body, text=text)))
        attempts += 1
        _, _, voiced = speech_span(y, sr)
        if voiced == 0:  # 합성 서버는 내부 오류가 나면 200 과 함께 1초 무음(16kHz)을 돌려준다
            log(f"  무음 결과 ({attempt + 1}) — {text[:30]}")
            continue
        rate = len(ref) / voiced
        rate_ok = RATE_LO <= rate <= RATE_HI
        # 받아 적은 글도 같은 규칙으로 다듬어 비교한다 (Whisper 는 '세 시' 를 '3시' 로 적는다)
        c = cer(ref, syllables(normalize(transcribe(y, sr)))) if ASR_CHECK and ref else 0.0
        ok = rate_ok and c * len(ref) <= tolerance
        score = c + (0 if rate_ok else 1)
        if best is None or score < best[0]:
            best = (score, y, sr, c)
        if ok:
            break
        log(f"  다시 생성 ({attempt + 1}): 조음 {rate:.1f}음절/초, CER {c:.2f} — {text[:30]}")
    if best is None:
        raise Bad(502, f"합성 서버가 소리 없는 결과만 돌려줬습니다 ({text[:20]}…). 서버 로그를 확인하세요: tts-server.log")
    return best[1], best[2], attempts - 1, best[3]


def assemble(parts, sr, fade=0.005):
    """[(소리, 뒤 쉼 초)] 를 이어 붙인다. 문장 앞뒤에 모델이 넣은 정적은 LEAD_MAX/TAIL_MAX 까지만 남기고(들쭉날쭉 방지) 그 뒤에 쉼을 넣는다"""
    out, n = [], int(sr * fade)
    ramp = np.linspace(0, 1, n, dtype=np.float32)
    for i, (y, pause) in enumerate(parts):
        a, b, _ = speech_span(y, sr)
        y = y[max(0, a - int(sr * LEAD_MAX)): min(len(y), b + int(sr * TAIL_MAX))].copy()
        if len(y) > 2 * n:
            y[:n] *= ramp
            y[-n:] *= ramp[::-1]
        out.append(y)
        if i < len(parts) - 1 and pause > 0:
            out.append(np.zeros(int(sr * pause), dtype=np.float32))
    return np.concatenate(out)


def ffmpeg(args, data=None):
    # apps/tts 폴더에서 돌린다: 필터 안의 모델 경로(arnndn=m=models/...)가 apps/tts 기준이다
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error"] + args, input=data, capture_output=True, cwd=HERE)
    if r.returncode:
        raise Bad(500, "오디오 변환(ffmpeg)에 실패했습니다: " + r.stderr.decode("utf8", "replace").strip())
    return r.stdout


_uvr_lock = threading.Lock()


def dereverb(wav, agg):
    """방 울림 제거 — dereverb.py 를 따로 띄워 메모리를 바로 돌려받는다. 메모리를 크게 써서 한 번에 하나씩 돌린다."""
    with _uvr_lock, tempfile.TemporaryDirectory() as tmp:
        inp = os.path.join(tmp, "in.wav")
        ffmpeg(["-i", "pipe:0", "-ac", "2", "-ar", "44100", inp], wav)  # 모델 입력 형식
        r = subprocess.run([sys.executable, here("dereverb.py"), inp, os.path.join(tmp, "dry"), str(agg)], capture_output=True, cwd=HERE)
        if r.returncode:
            raise Bad(500, "울림 제거에 실패했습니다: " + (r.stderr.decode("utf8", "replace").strip().splitlines() or [f"종료 코드 {r.returncode}"])[-1])
        return ffmpeg(["-i", glob.glob(os.path.join(tmp, "dry", "*"))[0], "-ac", "1", "-f", "wav", "pipe:1"])


def encode(wav, fmt, voice):
    codec, opts, container, _ = FORMATS[fmt]
    if "dereverb_agg" in voice:
        wav = dereverb(wav, voice["dereverb_agg"])
    # 목소리에 post_filter 가 있으면 그것을, 없으면 TTS_POST_FILTER 를 쓴다
    filt = voice.get("post_filter", env.get("TTS_POST_FILTER", "")).strip()
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out." + fmt)
        ffmpeg(["-i", "pipe:0"] + (["-af", filt] if filt else []) + ["-c:a", codec] + opts + ["-f", container, out], wav)
        with open(out, "rb") as f:
            return f.read()


def filename(text, fmt):
    return "_".join(re.findall(r"\w+", text)[:FILENAME_WORDS] or ["tts"]) + "." + fmt


class Handler(BaseHTTPRequestHandler):
    def send(self, status, data, ctype, headers=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, status, obj):
        self.send(status, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        if self.path == "/":
            with open(PAGE, "rb") as f:
                self.send(200, f.read(), "text/html; charset=utf-8")
        elif self.path == "/voices":
            try:
                # cost: 화면의 예상 시간 배율 — 방 울림 제거(dereverb)를 거치는 목소리는 약 2배 걸린다 (실측 2026-10-08 송강 37초 / 송이 22초)
                self.send_json(200, [{"name": v["name"], "model": v.get("model", ""), "cost": 2.0 if "dereverb_agg" in v else 1.0,
                                      "styles": [{"id": s.get("id", s["name"]), "name": s["name"]} for s in v["styles"]]} for v in voices()])
            except (OSError, ValueError, KeyError) as e:
                self.send_json(500, {"error": f"목소리·감정 목록을 읽지 못했습니다: {e}"})
        elif self.path == "/config":
            try:
                self.send_json(200, dict(speed=float(env["TTS_SPEED"]), speed_min=lo, speed_max=hi, speed_step=step,
                                         pause=float(env["TTS_FRAGMENT_INTERVAL"]), pause_min=pause_lo, pause_max=pause_hi, pause_step=pause_step,
                                         question=env["TTS_QUESTION_END"], presets=presets(), max_chars=MAX_CHARS, max_takes=int(env["TTS_WEB_MAX_TAKES"]), formats=list(FORMATS),
                                         timeout_sec=SYNTH_TIMEOUT))  # 화면이 요청을 끊기 전에 기다릴 최소 시간
            except (OSError, ValueError, KeyError) as e:
                self.send_json(500, {"error": f"설정을 읽지 못했습니다: {e}"})
        elif self.path == "/health":
            try:
                up = reachable(SERVER)
                self.send_json(200 if up else 503, {"server": up, "asr": ASR_CHECK})
            except (OSError, ValueError, KeyError) as e:
                self.send_json(500, {"error": f"목소리 목록을 읽지 못했습니다: {e}"})
        else:
            self.send_json(404, {"error": "없는 주소입니다."})

    def client_gone(self):
        """브라우저가 요청을 끊었는지 (끊겼으면 남은 문장을 만들지 않고 합성 서버를 다음 요청에 넘긴다)"""
        try:
            r, _, _ = select.select([self.connection], [], [], 0)
            return bool(r) and self.connection.recv(1, socket.MSG_PEEK) == b""
        except OSError:
            return True

    def do_POST(self):
        if self.path != "/synth":
            return self.send_json(404, {"error": "없는 주소입니다."})
        t0 = time.time()
        try:
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if not 0 <= n <= MAX_BODY:
                    raise Bad(413, "요청이 너무 큽니다.")
                req = json.loads(self.rfile.read(n))
                assert isinstance(req, dict)
            except (ValueError, AssertionError):
                raise Bad(400, "요청 형식이 올바르지 않습니다.")
            fmt = req.get("format")
            if fmt not in FORMATS:
                raise Bad(400, f"형식은 {', '.join(FORMATS)} 중 하나여야 합니다.")
            text, voice, body, segs = build_body(req)
            with _server_lock:  # 합성 서버는 한 번에 하나씩 — 요청이 겹치면 차례를 기다린다
                parts, retries, worst, rates = [], 0, 0.0, set()
                for s, kind, pause in segs:
                    if self.client_gone():
                        log(f"synth 중단: 브라우저가 요청을 끊음 ({len(parts)}/{len(segs)}문장)")
                        return
                    y, sr, k, c = synth_segment(voice, body, s)
                    parts.append((y, pause))
                    rates.add(sr)
                    retries += k
                    worst = max(worst, c)
            if len(rates) != 1:
                raise Bad(502, f"합성 서버가 문장마다 다른 샘플링 주파수를 돌려줬습니다: {sorted(rates)}")
            audio = encode(write_wav(assemble(parts, sr), sr), fmt, voice)
        except Bad as e:
            log(f"synth 실패 {e.status}: {e}")
            return self.send_json(e.status, {"error": str(e)})
        except Exception as e:  # 예상 못 한 오류도 연결을 끊지 않고 알려 준다
            log(f"synth 오류: {type(e).__name__}: {e}")
            return self.send_json(500, {"error": f"처리 중 오류가 났습니다: {type(e).__name__}: {e}"})
        log(f"synth {voice['name']} {len(text)}자 {len(segs)}문장 재생성 {retries}회 CER최대 {worst:.2f} {time.time() - t0:.1f}초")
        name = filename(text, fmt)
        self.send(200, audio, FORMATS[fmt][3], [
            ("Content-Disposition", "attachment; filename=\"tts.%s\"; filename*=UTF-8''%s" % (fmt, urllib.parse.quote(name))),
            ("X-TTS-Segments", str(len(segs))), ("X-TTS-Retries", str(retries)), ("X-TTS-CER", f"{worst:.3f}")])


if __name__ == "__main__":
    addr = (env["TTS_WEB_HOST"], int(env["TTS_WEB_PORT"]))
    log("웹 테스트 화면 실행 중:", *addr, f"(발음 검사 {'켜짐 ' + ASR_MODEL if ASR_CHECK else '꺼짐'}, 문장 최대 {SEG_MAX_CHARS}자)")
    if ASR_CHECK:
        threading.Thread(target=transcribe, args=(np.zeros(16000, dtype=np.float32), 16000), daemon=True).start()  # 모델을 미리 읽어 둔다
    ThreadingHTTPServer(addr, Handler).serve_forever()
