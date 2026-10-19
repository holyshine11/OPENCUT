import type { FrameRate } from "opencut-wasm";
import type { ExportOptions } from "./index";
import type { TCanvasSize } from "@/project/types";
import { frameRateToFloat } from "@/fps/utils";
import {
	captionFormOf,
	type CaptionForm,
} from "@/transcription/caption-layout-store";

export const DEFAULT_EXPORT_OPTIONS = {
	format: "mp4",
	quality: "high",
	includeAudio: true,
} satisfies ExportOptions;

// 숏폼·롱폼 업로드 기준. 60fps 촬영본이 섞여도 기본은 이 값으로 내보낸다
export const MAX_DEFAULT_EXPORT_FPS: FrameRate = {
	numerator: 30,
	denominator: 1,
};

export function defaultExportFps({
	projectFps,
}: {
	projectFps: FrameRate;
}): FrameRate {
	return frameRateToFloat(projectFps) > frameRateToFloat(MAX_DEFAULT_EXPORT_FPS)
		? MAX_DEFAULT_EXPORT_FPS
		: projectFps;
}

// 유튜브 업로드 크기. 숏폼은 세로, 롱폼은 가로 1080p
export const YOUTUBE_EXPORT_SIZES: Record<CaptionForm, TCanvasSize> = {
	shortForm: { width: 1080, height: 1920 },
	longForm: { width: 1920, height: 1080 },
};

export function youtubeExportSize({
	canvasSize,
}: {
	canvasSize: TCanvasSize;
}): TCanvasSize {
	return YOUTUBE_EXPORT_SIZES[captionFormOf({ canvasSize })];
}

/** source를 비율을 지킨 채 target 가운데에 최대한 크게 놓을 자리 */
export function fitInside({
	source,
	target,
}: {
	source: TCanvasSize;
	target: TCanvasSize;
}): { x: number; y: number; width: number; height: number } {
	const scale = Math.min(
		target.width / source.width,
		target.height / source.height,
	);
	const width = Math.round(source.width * scale);
	const height = Math.round(source.height * scale);
	return {
		x: Math.round((target.width - width) / 2),
		y: Math.round((target.height - height) / 2),
		width,
		height,
	};
}
