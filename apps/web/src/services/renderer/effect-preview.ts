import { createCanvasSurface } from "./canvas-utils";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import { buildDefaultParamValues } from "@/params/registry";
import type { ParamValues } from "@/params";
import { gpuRenderer, isGpuAvailable } from "./gpu-renderer";

const PREVIEW_SIZE = 160;
const PREVIEW_IMAGE_PATH = "/effects/preview.jpg";
/** Thumbnails kept after their GPU render; a strip or grid redraws from here. */
const MAX_CACHED_PREVIEWS = 300;

class EffectPreviewService {
	private testSourceCanvas: OffscreenCanvas | null = null;
	private previewImageElement: HTMLImageElement | null = null;
	private onReadyCallbacks = new Set<() => void>();
	private renderedPreviews = new Map<string, OffscreenCanvas>();

	readonly PREVIEW_SIZE = PREVIEW_SIZE;

	constructor() {
		this.loadPreviewImage();
	}

	onPreviewImageReady({ callback }: { callback: () => void }): () => void {
		this.onReadyCallbacks.add(callback);
		return () => this.onReadyCallbacks.delete(callback);
	}

	renderPreview({
		effectType,
		params,
		targetCanvas,
		uniformDimensions,
	}: {
		effectType: string;
		params: ParamValues;
		targetCanvas: HTMLCanvasElement;
		uniformDimensions?: { width: number; height: number };
	}): void {
		const size = PREVIEW_SIZE;
		const targetCtx = targetCanvas.getContext(
			"2d",
		) as CanvasRenderingContext2D | null;
		if (!targetCtx) {
			return;
		}

		if (targetCanvas.width !== size) targetCanvas.width = size;
		if (targetCanvas.height !== size) targetCanvas.height = size;

		const source = this.getTestSource({ width: size, height: size });
		if (!source) {
			targetCtx.clearRect(0, 0, size, size);
			return;
		}

		const cacheKey = `${effectType}:${JSON.stringify(params)}:${uniformDimensions?.width ?? size}x${uniformDimensions?.height ?? size}`;
		const cached = this.renderedPreviews.get(cacheKey);
		if (cached) {
			targetCtx.clearRect(0, 0, size, size);
			targetCtx.drawImage(cached, 0, 0, size, size);
			return;
		}

		try {
			const definition = effectsRegistry.get(effectType);
			const resolvedParams =
				Object.keys(params).length > 0
					? params
					: buildDefaultParamValues(definition.params);

			const passes = resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width: uniformDimensions?.width ?? size,
				height: uniformDimensions?.height ?? size,
			});
			const result = this.applyGpuEffect({
				source,
				width: size,
				height: size,
				passes,
			});

			targetCtx.clearRect(0, 0, size, size);
			targetCtx.drawImage(result, 0, 0, size, size);
			// before the GPU is up the effect is skipped, which must not stick
			if (passes.length === 0 || isGpuAvailable()) {
				this.remember({ cacheKey, canvas: targetCanvas });
			}
		} catch (error) {
			console.warn("Failed to render effect preview", { effectType, error });
			targetCtx.clearRect(0, 0, size, size);
			targetCtx.drawImage(source, 0, 0, size, size);
		}
	}

	private remember({
		cacheKey,
		canvas,
	}: {
		cacheKey: string;
		canvas: HTMLCanvasElement;
	}): void {
		// the GPU result is a shared surface, so keep a copy of what was drawn
		const { canvas: copy, context } = createCanvasSurface({
			width: canvas.width,
			height: canvas.height,
		});
		context.drawImage(canvas, 0, 0);
		this.renderedPreviews.set(cacheKey, copy);
		if (this.renderedPreviews.size > MAX_CACHED_PREVIEWS) {
			const oldest = this.renderedPreviews.keys().next().value;
			if (oldest !== undefined) this.renderedPreviews.delete(oldest);
		}
	}

	private loadPreviewImage(): void {
		if (typeof window === "undefined") return;
		const image = new Image();
		image.onload = () => {
			this.testSourceCanvas = null;
			this.renderedPreviews.clear();
			for (const callback of this.onReadyCallbacks) {
				callback();
			}
		};
		image.src = PREVIEW_IMAGE_PATH;
		this.previewImageElement = image;
	}

	private createTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas | null {
		const isImageReady =
			this.previewImageElement?.complete &&
			(this.previewImageElement.naturalWidth ?? 0) > 0;
		if (!isImageReady || !this.previewImageElement) {
			return null;
		}

		const { canvas, context } = createCanvasSurface({ width, height });
		context.drawImage(this.previewImageElement, 0, 0, width, height);
		return canvas;
	}

	private getTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas | null {
		if (
			!this.testSourceCanvas ||
			this.testSourceCanvas.width !== width ||
			this.testSourceCanvas.height !== height
		) {
			this.testSourceCanvas = this.createTestSource({ width, height });
		}
		return this.testSourceCanvas;
	}

	private applyGpuEffect({
		source,
		width,
		height,
		passes,
	}: {
		source: OffscreenCanvas;
		width: number;
		height: number;
		passes: ReturnType<typeof resolveEffectPasses>;
	}): OffscreenCanvas {
		return gpuRenderer.applyEffect({
			source,
			width,
			height,
			passes,
		});
	}
}

export const effectPreviewService = new EffectPreviewService();
