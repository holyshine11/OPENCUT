import type { FrameRate } from "opencut-wasm";
import type { MediaTime } from "@/wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
	/** 이 구간만 내보낸다. 없으면 타임라인 전체 */
	range?: { start: MediaTime; end: MediaTime };
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	downloadBlob({ blob: new Blob([buffer], { type: mimeType }), filename });
}

type SaveFilePicker = (options: {
	suggestedName: string;
	types: { accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/**
 * Lets the user choose the file name and folder. Must run inside the click
 * (user activation), so call it before the long export starts.
 */
export async function pickSaveFile({
	filename,
	mimeType,
	extension,
}: {
	filename: string;
	mimeType: string;
	extension: string;
}): Promise<FileSystemFileHandle | "cancelled" | "unsupported"> {
	// Chromium only; Safari/Firefox fall back to a plain download
	const picker = (window as { showSaveFilePicker?: SaveFilePicker })
		.showSaveFilePicker;
	if (!picker) return "unsupported";
	try {
		return await picker({
			suggestedName: filename,
			types: [{ accept: { [mimeType]: [extension] } }],
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		return "unsupported";
	}
}

export async function writeBufferToFile({
	buffer,
	handle,
}: {
	buffer: ArrayBuffer;
	handle: FileSystemFileHandle;
}): Promise<void> {
	const writable = await handle.createWritable();
	await writable.write(buffer);
	await writable.close();
}

/** Saves a Blob without reading it into memory first (large backups stay lazy) */
export function downloadBlob({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): void {
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}
