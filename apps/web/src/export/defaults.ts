import type { FrameRate } from "opencut-wasm";
import type { ExportOptions } from "./index";

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

const toFloat = (fps: FrameRate) => fps.numerator / fps.denominator;

export function defaultExportFps({
	projectFps,
}: {
	projectFps: FrameRate;
}): FrameRate {
	return toFloat(projectFps) > toFloat(MAX_DEFAULT_EXPORT_FPS)
		? MAX_DEFAULT_EXPORT_FPS
		: projectFps;
}
