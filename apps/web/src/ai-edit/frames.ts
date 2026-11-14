import { getClipFrameThumbnail } from "@/media/clip-frames";
import type { MediaAsset } from "@/media/types";

const SECONDS_PER_FRAME = 3;
const MIN_FRAMES = 2;
const MAX_FRAMES = 12;
const LABEL_HEIGHT = 18;

export interface ClipSheet {
	times: number[];
	/** 프레임을 가로로 이어 붙이고 아래에 시각을 적은 JPEG data URL */
	sheet: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = reject;
		image.src = url;
	});
}

/**
 * Claude가 볼 클립 한 장 요약. 3초에 한 장꼴로 뽑아 한 줄로 붙인다.
 * shortcut: 프레임 높이 180px(타임라인 썸네일 재사용)이라 작은 글씨·계량은 못 읽는다, 재료를 자주 틀리면 전용 디코더로 키운다
 */
export async function buildClipSheet({ asset }: { asset: MediaAsset }): Promise<ClipSheet | null> {
	const duration = asset.duration ?? 0;
	if (asset.type !== "video" || duration <= 0) return null;
	const count = Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.ceil(duration / SECONDS_PER_FRAME)));
	// 구간마다 가운데 시각을 뽑는다. 맨 끝 프레임은 디코딩이 안 되는 파일이 있다
	const times = Array.from({ length: count }, (_, index) => ((index + 0.5) * duration) / count);
	const urls = await Promise.all(
		times.map((time) => getClipFrameThumbnail({ mediaId: asset.id, file: asset.file, time })),
	);
	const frames = await Promise.all(
		urls.map((url, index) => (url ? loadImage(url).then((image) => ({ image, time: times[index] })) : null)),
	);
	const shown = frames.filter((frame) => frame !== null);
	if (shown.length === 0) return null;

	const { width, height } = shown[0].image;
	const canvas = document.createElement("canvas");
	canvas.width = width * shown.length;
	canvas.height = height + LABEL_HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.fillStyle = "#000";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#fff";
	context.font = "12px sans-serif";
	context.textAlign = "center";
	for (const [index, frame] of shown.entries()) {
		context.drawImage(frame.image, index * width, 0, width, height);
		context.fillText(`${frame.time.toFixed(1)}s`, (index + 0.5) * width, height + 13);
	}
	return { times: shown.map((frame) => frame.time), sheet: canvas.toDataURL("image/jpeg", 0.8) };
}
