import { getClipFrameThumbnail } from "@/media/clip-frames";
import type { MediaAsset } from "@/media/types";

const SECONDS_PER_FRAME = 3;
const MIN_FRAMES = 2;
const MAX_FRAMES = 12;
const LABEL_HEIGHT = 22;
const FRAME_HEIGHT = 480;
// Claude는 긴 변이 이보다 큰 이미지를 줄여서 본다. 시트 한 장이 이 안에 들게 격자를 짠다
const SHEET_MAX_SIDE = 1536;

/** 프레임 count장을 한 변 SHEET_MAX_SIDE 안에 가장 크게 넣는 격자. scale은 프레임 축소 비율(1 이하) */
export function sheetGrid({
	count,
	width,
	height,
}: {
	count: number;
	width: number;
	height: number;
}): { columns: number; scale: number } {
	let best = { columns: 1, scale: 0 };
	for (let columns = 1; columns <= count; columns++) {
		const rows = Math.ceil(count / columns);
		const scale = Math.min(
			1,
			SHEET_MAX_SIDE / (columns * width),
			(SHEET_MAX_SIDE - rows * LABEL_HEIGHT) / (rows * height),
		);
		if (scale > best.scale) best = { columns, scale };
	}
	return best;
}

export interface ClipSheet {
	times: number[];
	/** 프레임을 격자(왼쪽 위부터 오른쪽으로)로 붙이고 프레임마다 아래에 시각을 적은 JPEG data URL */
	sheet: string;
}

const sizeOf = (image: HTMLImageElement) => ({ width: image.width, height: image.height });

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = reject;
		image.src = url;
	});
}

/**
 * Claude가 볼 클립 한 장 요약. 3초에 한 장꼴로 뽑아 격자로 붙인다
 */
export async function buildClipSheet({ asset }: { asset: MediaAsset }): Promise<ClipSheet | null> {
	const duration = asset.duration ?? 0;
	if (asset.type !== "video" || duration <= 0) return null;
	const count = Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.ceil(duration / SECONDS_PER_FRAME)));
	// 구간마다 가운데 시각을 뽑는다. 맨 끝 프레임은 디코딩이 안 되는 파일이 있다
	const times = Array.from({ length: count }, (_, index) => ((index + 0.5) * duration) / count);
	const urls = await Promise.all(
		times.map((time) => getClipFrameThumbnail({ mediaId: asset.id, file: asset.file, time, height: FRAME_HEIGHT })),
	);
	const frames = await Promise.all(
		urls.map((url, index) => (url ? loadImage(url).then((image) => ({ image, time: times[index] })) : null)),
	);
	const shown = frames.filter((frame) => frame !== null);
	if (shown.length === 0) return null;

	const { columns, scale } = sheetGrid({ count: shown.length, ...sizeOf(shown[0].image) });
	const width = Math.floor(shown[0].image.width * scale);
	const height = Math.floor(shown[0].image.height * scale);
	const canvas = document.createElement("canvas");
	canvas.width = width * columns;
	canvas.height = (height + LABEL_HEIGHT) * Math.ceil(shown.length / columns);
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.fillStyle = "#000";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#fff";
	context.font = "15px sans-serif";
	context.textAlign = "center";
	for (const [index, frame] of shown.entries()) {
		const x = (index % columns) * width;
		const y = Math.floor(index / columns) * (height + LABEL_HEIGHT);
		context.drawImage(frame.image, x, y, width, height);
		context.fillText(`${frame.time.toFixed(1)}s`, x + width / 2, y + height + 16);
	}
	return { times: shown.map((frame) => frame.time), sheet: canvas.toDataURL("image/jpeg", 0.8) };
}
