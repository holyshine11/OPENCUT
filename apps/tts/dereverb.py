# 방 울림 제거 (GPT-SoVITS 내장 UVR5 DeEcho-DeReverb). tts-web.py 가 문장마다 따로 띄운다.
# 모델이 한 번 돌 때 잡은 메모리를 파이썬이 놓지 않아서(창 512 = 6.2GB, 256 = 3.4GB, 측정 2026-10-21), 프로세스가 끝나야 돌려받는다.
# 띄우는 비용은 약 0.7초 (torch 읽기 0.5 + 모델 0.15)
# usage: python dereverb.py <입력.wav (44.1kHz 스테레오)> <출력 폴더> <세기 0–20>   (경로·창 크기: tts.env, apps/tts 폴더에서 실행)
import os, sys

env = os.environ
inp, out, agg = sys.argv[1], sys.argv[2], int(sys.argv[3])
sys.path.insert(0, env["TTS_UVR5_DIR"])
from vr import AudioPreDeEcho

m = AudioPreDeEcho(agg=agg, model_path=env["TTS_DEREVERB_MODEL"], device="cpu", is_half=False)
m.data["window_size"] = int(env["TTS_DEREVERB_WINDOW"])
m._path_audio_(inp, None, out, "wav")  # DeEcho 는 건조한 소리를 ins 쪽에 쓴다
