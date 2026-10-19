// 음성 인식 정확도·속도 측정. 브라우저와 같은 engine.ts를 bun(onnxruntime-node, CPU)으로 돌린다.
//
// 사용: bun scripts/stt-bench.ts <샘플 폴더> <모델 폴더> [dtype] [용어 파일]
//   샘플 폴더: <이름>.mp4와 정답 <이름>.srt 쌍. 정답이 없는 영상은 결과 SRT만 남긴다
//   모델 폴더: Hugging Face 저장소 구조 그대로 내려받은 폴더 (예: ~/.cache/opencut-models)
//   dtype: fp16 | q8 | fp32 (기본 fp16)
// 결과: <샘플 폴더>/results/<이름>.<dtype>.srt, CER과 처리 시간 출력
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { env } from "@huggingface/transformers";
import { loadTranscriptionEngine } from "@/services/transcription/engine";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import type { TranscriptionSegment } from "@/transcription/types";
import { parseTerms } from "@/transcription/terms-store";

const [sampleDir, modelDir, dtypeName = "fp16", termsFile] = process.argv.slice(2);
if (!sampleDir || !modelDir) {
	console.error("usage: bun scripts/stt-bench.ts <sampleDir> <modelDir> [dtype] [termsFile]");
	process.exit(1);
}

env.localModelPath = modelDir;
env.allowRemoteModels = false;

async function decodeAudio({ file }: { file: string }): Promise<Float32Array> {
	const proc = Bun.spawn(
		["ffmpeg", "-v", "error", "-i", file, "-ac", "1", "-ar", String(DEFAULT_TRANSCRIPTION_SAMPLE_RATE), "-f", "f32le", "-"],
		{ stdout: "pipe" },
	);
	const buffer = await new Response(proc.stdout).arrayBuffer();
	return new Float32Array(buffer);
}

function srtText({ srt }: { srt: string }): string {
	return srt
		.split(/\r?\n/)
		.filter((line) => line.trim() && !line.includes("-->") && !/^\d+$/.test(line.trim()))
		.join(" ");
}

// CER은 띄어쓰기·문장부호를 뺀 글자로 잰다
function normalize(text: string): string[] {
	return [...text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "")];
}

function editDistance({ a, b }: { a: string[]; b: string[] }): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length];
}

function formatTime(seconds: number): string {
	const ms = Math.round(seconds * 1000);
	const pad = (value: number, size = 2) => String(value).padStart(size, "0");
	return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function toSrt({ segments }: { segments: TranscriptionSegment[] }): string {
	return segments
		.map((segment, i) => `${i + 1}\n${formatTime(segment.start)} --> ${formatTime(segment.end)}\n${segment.text}\n`)
		.join("\n");
}

const DTYPES: Record<string, Record<string, string>> = {
	fp16: { encoder_model: "fp16", decoder_model_merged: "fp16" },
	q8: { encoder_model: "q8", decoder_model_merged: "q8" },
	fp32: { encoder_model: "fp32", decoder_model_merged: "fp32" },
};

const terms = termsFile ? parseTerms({ input: await readFile(termsFile, "utf8") }) : [];
const engine = await loadTranscriptionEngine({ device: "cpu", dtype: DTYPES[dtypeName] });
const resultDir = join(sampleDir, "results");
await mkdir(resultDir, { recursive: true });

const videos = (await readdir(sampleDir)).filter((name) => name.endsWith(".mp4")).sort();
for (const video of videos) {
	const name = basename(video, ".mp4");
	const audio = await decodeAudio({ file: join(sampleDir, video) });
	const audioSeconds = audio.length / DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const startedAt = performance.now();
	const result = await engine.transcribe({ audio, language: "ko", terms });
	const elapsed = (performance.now() - startedAt) / 1000;
	await writeFile(join(resultDir, `${name}.${dtypeName}.srt`), toSrt({ segments: result.segments }));

	let cer = "no reference";
	const reference = await readFile(join(sampleDir, `${name}.srt`), "utf8").catch(() => null);
	if (reference) {
		const ref = normalize(srtText({ srt: reference }));
		const hyp = normalize(result.text);
		cer = `${((editDistance({ a: ref, b: hyp }) / ref.length) * 100).toFixed(1)}%`;
	}
	console.log(
		`${name}\taudio ${audioSeconds.toFixed(0)}s\ttook ${elapsed.toFixed(0)}s\tCER ${cer}`,
	);
}
