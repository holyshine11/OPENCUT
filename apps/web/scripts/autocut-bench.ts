// 편집점 찾기를 실제 영상으로 확인한다. 브라우저와 같은 VAD와 autocut/ 규칙을 bun(CPU)으로 돌린다.
//
// 사용: bun scripts/autocut-bench.ts <영상>...
//   모델은 앱과 같은 public/models 를 쓴다 (bun run models 로 받아 둔다)
// 결과: 영상마다 편집점 개수와 처리 시간. <영상>.points.tsv에 편집점(시각, 이유). 확장자를 .srt로 바꾼 자막 파일이 있으면
//   앱에서 자막 단어를 합치듯 그 자막 구간도 말로 본다
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { env } from "@huggingface/transformers";
import { frameDifference, proposeEditPoints } from "@/autocut/edit-points";
import settings from "@/autocut/settings.json";
import { collectSpeechRanges } from "@/autocut/speech";
import { computeSpeechProbabilities, loadVadModel } from "@/services/transcription/engine";
import { parseSrt } from "@/subtitles/srt";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import transcriptionSettings from "@/transcription/settings.json";

const videos = process.argv.slice(2);
if (videos.length === 0) {
	console.error("usage: bun scripts/autocut-bench.ts <video>...");
	process.exit(1);
}

env.localModelPath = join(resolve(import.meta.dir, "../public"), transcriptionSettings.local.modelPath);

async function decodeAudio({ file }: { file: string }): Promise<Float32Array> {
	const proc = Bun.spawn(
		["ffmpeg", "-v", "error", "-i", file, "-ac", "1", "-ar", String(DEFAULT_TRANSCRIPTION_SAMPLE_RATE), "-f", "f32le", "-"],
		{ stdout: "pipe" },
	);
	return new Float32Array(await new Response(proc.stdout).arrayBuffer());
}

/** 브라우저(CanvasSink)와 같은 크기·간격으로 프레임을 뽑아 frameDifference를 잰다 */
async function decodeMotion({ file }: { file: string }): Promise<Float32Array> {
	const { width, sampleFps } = settings.motion;
	const probe = Bun.spawn(
		["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
		{ stdout: "pipe" },
	);
	const [sourceWidth, sourceHeight] = (await new Response(probe.stdout).text()).trim().split(",").map(Number);
	const height = Math.round((sourceHeight * width) / sourceWidth);
	const proc = Bun.spawn(
		["ffmpeg", "-v", "error", "-i", file, "-vf", `fps=${sampleFps},scale=${width}:${height}`, "-pix_fmt", "rgba", "-f", "rawvideo", "-"],
		{ stdout: "pipe" },
	);
	const pixels = new Uint8ClampedArray(await new Response(proc.stdout).arrayBuffer());
	const frameBytes = width * height * 4;
	const frames = Math.floor(pixels.length / frameBytes);
	const motion = new Float32Array(Math.max(0, frames - 1));
	for (let i = 0; i < motion.length; i++) {
		motion[i] = frameDifference({
			previous: pixels.subarray(i * frameBytes, (i + 1) * frameBytes),
			next: pixels.subarray((i + 1) * frameBytes, (i + 2) * frameBytes),
		});
	}
	return motion;
}

const vad = await loadVadModel();
const windowSamples = transcriptionSettings.vad.windowSamples;

for (const video of videos) {
	const audio = await decodeAudio({ file: video });
	const probabilities = await computeSpeechProbabilities({ vad, audio });
	console.log(`${basename(video)}: ${(audio.length / DEFAULT_TRANSCRIPTION_SAMPLE_RATE).toFixed(1)}초`);

	const motionStartedAt = performance.now();
	const motion = await decodeMotion({ file: video });
	const points = proposeEditPoints({
		motion,
		motionSeconds: 1 / settings.motion.sampleFps,
		speech: collectSpeechRanges({
			probabilities,
			windowSeconds: windowSamples / DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
			words: await readFile(video.replace(/\.[^.]+$/, ".srt"), "utf8").then(
				(input) =>
					parseSrt({ input }).captions.map((cue) => ({ start: cue.startTime, end: cue.startTime + cue.duration })),
				() => [],
			),
			settings,
		}),
		frameSeconds: 1 / 30,
		settings,
	});
	await writeFile(
		`${video}.points.tsv`,
		points.map((point) => `${point.time.toFixed(3)}\t${point.reason}`).join("\n"),
	);
	console.log(
		`  편집점 ${points.length}개 → 조각 ${points.length + 1}개, 움직임 분석 ${((performance.now() - motionStartedAt) / 1000).toFixed(1)}초`,
	);
	for (const point of points) console.log(`  ${point.time.toFixed(1)} ${point.reason}`);
}
