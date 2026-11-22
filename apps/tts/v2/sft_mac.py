# Qwen3-TTS 단일 화자 미세조정, 맥(MPS)용. 공식 finetuning/sft_12hz.py 와 같은 손실(talker + 0.3*sub_talker)과 화자 임베딩(3000번)을 쓴다.
# 공식과 다른 점: 글자 임베딩에 text_projection 을 거친다(추론 코드와 같게, 0.6B 는 차원이 달라 필수), flash-attn 대신 sdpa, accelerate 없이 MPS, --lora 면 talker·code_predictor 에 LoRA(16GB에서 1.7B 용),
# 에폭마다 체크포인트 대신 --save_every 에폭마다 저장, 학습률 워밍업·코사인.
# python sft_mac.py --init Qwen/Qwen3-TTS-12Hz-0.6B-Base --train songi_codes.jsonl --out out/songi --speaker songi [--lora 32]
import argparse, json, os, sys, math, shutil, time, random
import torch
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "Qwen3-TTS/finetuning"))
from dataset import TTSDataset
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel
from safetensors.torch import save_file
from torch.utils.data import DataLoader
from transformers import AutoConfig
from huggingface_hub import snapshot_download

p = argparse.ArgumentParser()
p.add_argument("--init", required=True); p.add_argument("--train", required=True); p.add_argument("--out", required=True)
p.add_argument("--speaker", required=True); p.add_argument("--lr", type=float, default=2e-5); p.add_argument("--epochs", type=int, default=10)
p.add_argument("--batch", type=int, default=2); p.add_argument("--accum", type=int, default=4); p.add_argument("--lora", type=int, default=0)
p.add_argument("--save_every", type=int, default=2); p.add_argument("--seed", type=int, default=0)
a = p.parse_args()
torch.manual_seed(a.seed); random.seed(a.seed)
dev = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
src = a.init if os.path.isdir(a.init) else snapshot_download(a.init)
tts = Qwen3TTSModel.from_pretrained(src, torch_dtype=torch.bfloat16, attn_implementation="sdpa")
model = tts.model.to(dev)
if os.environ.get("MEMDBG"): print("  [mem] 모델 올린 뒤", f"{torch.mps.current_allocated_memory()/1e9:.2f}GB", flush=True)
config = AutoConfig.from_pretrained(src)
data = [json.loads(l) for l in open(a.train)]
ds = TTSDataset(data, tts.processor, config)
def collate(batch):  # 길이를 32 단위로 맞춰 MPS 가 길이마다 그래프·메모리 블록을 새로 만들지 않게 한다
    out = ds.collate_fn(batch); t = out["input_ids"].shape[1]; T = -(-t // 32) * 32
    if T > t:
        for k, v in out.items():
            if k == "ref_mels": continue
            pad = [0, 0] * (v.dim() - 2) + [0, T - t]
            out[k] = torch.nn.functional.pad(v, pad, value=-100 if k == "codec_0_labels" else 0)
    return out
dl = DataLoader(ds, batch_size=a.batch, shuffle=True, collate_fn=collate)

if a.lora:
    from peft import LoraConfig, inject_adapter_in_model
    for prm in model.parameters():
        prm.requires_grad_(False)
    cfg = LoraConfig(r=a.lora, lora_alpha=a.lora, lora_dropout=0.05,
                     target_modules=r".*talker\..*(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)$")
    model = inject_adapter_in_model(cfg, model)
    for n, prm in model.named_parameters():
        if "lora_" in n:
            prm.data = prm.data.float(); prm.requires_grad_(True)  # LoRA 가중치는 fp32 로 학습
else:
    for n, prm in model.named_parameters():
        prm.requires_grad_(not n.startswith("speaker_encoder"))
# 활성값을 저장하지 않고 역전파 때 다시 계산(16GB 에서 긴 문장의 활성값이 수 GB 라서)
for sub in (model.talker.model, model.talker.code_predictor.model):
    sub.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False}) if hasattr(sub, "gradient_checkpointing_enable") else setattr(sub, "gradient_checkpointing", True)
params = [q for q in model.parameters() if q.requires_grad]
print(f"학습 파라미터 {sum(q.numel() for q in params) / 1e6:.1f}M / 전체 {sum(q.numel() for q in model.parameters()) / 1e6:.0f}M, 클립 {len(ds)}", flush=True)
opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)
total = math.ceil(len(dl) / a.accum) * a.epochs; warm = max(1, total // 20)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / total))))

spk_emb = None
def save(tag):
    od = os.path.join(a.out, tag)
    # 맨 위 model.safetensors 만 새로 쓰고, speech_tokenizer/ 의 가중치는 그대로 복사해야 소리가 난다
    shutil.copytree(src, od, dirs_exist_ok=True, ignore=lambda d, names: [n for n in names if n == ".cache" or (os.path.samefile(d, src) and n == "model.safetensors")])
    cfgd = json.load(open(os.path.join(src, "config.json")))
    cfgd["tts_model_type"] = "custom_voice"
    cfgd["talker_config"]["spk_id"] = {a.speaker: 3000}; cfgd["talker_config"]["spk_is_dialect"] = {a.speaker: False}
    json.dump(cfgd, open(os.path.join(od, "config.json"), "w"), indent=2, ensure_ascii=False)
    sd = {}
    for k, v in model.state_dict().items():
        if k.startswith("speaker_encoder") or "lora_" in k:
            continue
        sd[k.replace(".base_layer", "")] = v
    if a.lora:  # LoRA 를 합쳐서 일반 체크포인트로 저장
        scale = 1.0
        for n, m in model.named_modules():
            if hasattr(m, "lora_A") and "default" in m.lora_A:
                delta = (m.lora_B["default"].weight.float() @ m.lora_A["default"].weight.float()) * m.scaling["default"]
                sd[n + ".weight"] = (m.base_layer.weight.float() + delta).to(torch.bfloat16)
    sd = {k: v.detach().to("cpu").contiguous() for k, v in sd.items()}
    w = sd["talker.model.codec_embedding.weight"].clone(); w[3000] = spk_emb[0].to(w.dtype).cpu(); sd["talker.model.codec_embedding.weight"] = w
    save_file(sd, os.path.join(od, "model.safetensors"))
    print("저장", od, flush=True)

model.train(); step = 0; t0 = time.time()
for ep in range(1, a.epochs + 1):
    run = 0.0; n = 0
    for i, b in enumerate(dl):
        b = {k: v.to(dev) for k, v in b.items()}
        with torch.no_grad():
            se = model.speaker_encoder(b["ref_mels"].to(torch.bfloat16)).detach()
        if spk_emb is None:
            spk_emb = se
        tid, cid = b["input_ids"][:, :, 0], b["input_ids"][:, :, 1]
        emb = model.talker.text_projection(model.talker.model.text_embedding(tid)) * b["text_embedding_mask"] + model.talker.model.codec_embedding(cid) * b["codec_embedding_mask"]
        emb[:, 6, :] = se
        for k in range(1, 16):
            emb = emb + model.talker.code_predictor.get_input_embeddings()[k - 1](b["codec_ids"][:, :, k]) * b["codec_mask"].unsqueeze(-1)
        if os.environ.get("MEMDBG") and i < 3: print("  [mem] 임베딩 후", emb.shape, f"{torch.mps.current_allocated_memory()/1e9:.2f}GB", flush=True)
        # 공식 스크립트는 이미 한 칸 민 labels 를 HF 손실(또 한 칸 민다)에 넘겨 두 칸 뒤를 맞히게 되고, 보조 예측기에도 한 칸 뒤 은닉을 준다.
        # 추론(code_predictor 입력 = [이전 위치 은닉, code0])과 같게: 위치 j 의 은닉은 j+1 의 code0 를 맞히고, 그 프레임의 나머지 15개 코드북의 조건이 된다.
        out = model.talker(inputs_embeds=emb[:, :-1, :], attention_mask=b["attention_mask"][:, :-1], output_hidden_states=True)
        lab = b["codec_0_labels"][:, 1:]
        talk_loss = torch.nn.functional.cross_entropy(out.logits.float().reshape(-1, out.logits.shape[-1]), lab.reshape(-1), ignore_index=-100)
        hs = out.hidden_states[0][-1]
        fm = b["codec_mask"][:, 1:]
        cids = b["codec_ids"][:, 1:][fm]                       # 프레임마다 16개 코드
        tp = model.talker
        sub_in = torch.cat([hs[fm].unsqueeze(1), tp.get_input_embeddings()(cids[:, :1])] +
                           [tp.code_predictor.get_input_embeddings()[k - 1](cids[:, k:k + 1]) for k in range(1, 15)], dim=1)
        sl = tp.code_predictor.forward_finetune(inputs_embeds=sub_in).logits   # [N, 15, V]: 위치 k(1..15)가 코드북 k 를 맞힌다
        sub = torch.nn.functional.cross_entropy(sl.float().reshape(-1, sl.shape[-1]), cids[:, 1:].reshape(-1))
        loss = (talk_loss + 0.3 * sub) / a.accum
        if os.environ.get("MEMDBG") and i < 3: print("  [mem] 순전파 후", f"{torch.mps.current_allocated_memory()/1e9:.2f}GB", flush=True)
        loss.backward()
        if os.environ.get("MEMDBG") and i < 3: print("  [mem] 역전파 후", f"{torch.mps.current_allocated_memory()/1e9:.2f}GB", flush=True)
        run += loss.item() * a.accum; n += 1
        del out, hs, emb, sub, loss, sl, sub_in, talk_loss
        if dev.type == "mps": torch.mps.empty_cache()
        if (i + 1) % 10 == 0:
            mem = torch.mps.driver_allocated_memory() / 1e9 if dev.type == "mps" else 0
            print(f"  에폭 {ep} 배치 {i + 1}/{len(dl)} 손실 {run / n:.4f} GPU {mem:.1f}GB 경과 {(time.time() - t0) / 60:.1f}분", flush=True)
        if (i + 1) % a.accum == 0 or i + 1 == len(dl):
            torch.nn.utils.clip_grad_norm_(params, 1.0); opt.step(); sched.step(); opt.zero_grad(); step += 1
    print(f"에폭 {ep}/{a.epochs} 손실 {run / n:.4f} lr {sched.get_last_lr()[0]:.2e} 경과 {(time.time() - t0) / 60:.1f}분", flush=True)
    if ep % a.save_every == 0 or ep == a.epochs:
        save(f"e{ep}")
