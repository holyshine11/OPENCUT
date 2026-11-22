# 잡음 제거 후보를 만든다: python denoise.py in.wav out_dir  → hp(저역만), df12/df20(DeepFilterNet3 감쇠 한도 dB), dfmax
import sys, os, numpy as np, soundfile as sf, torch
from scipy.signal import butter, sosfiltfilt
from df.enhance import init_df, enhance
inp, od = sys.argv[1], sys.argv[2]
os.makedirs(od, exist_ok=True)
y, sr = sf.read(inp, dtype="float32")
assert sr == 48000
y = sosfiltfilt(butter(4, 65, "highpass", fs=sr, output="sos"), y).astype(np.float32)  # 120Hz 아래 웅웅거림 정리
b = os.path.splitext(os.path.basename(inp))[0]
sf.write(f"{od}/{b}.hp.wav", y, sr, subtype="FLOAT")
model, st, _ = init_df()
x = torch.from_numpy(y)[None]
for lim in (12, 20, None):
    z = enhance(model, st, x, atten_lim_db=lim)[0].numpy()
    sf.write(f"{od}/{b}.df{lim or 'max'}.wav", z, sr, subtype="FLOAT")
print(b, "done")
