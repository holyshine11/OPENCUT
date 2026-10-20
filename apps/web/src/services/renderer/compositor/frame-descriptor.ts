import { drawCssBackground } from "@/gradients";
import { getMaskDefinition } from "@/masks";
import type { Mask, MaskBlendMode } from "@/masks/types";
import { getVisibleMasks } from "@/masks/list-ops";
import {
	fillStrengthToPixels,
	getMaskBlend,
	getMaskFill,
	isEffectFill,
} from "@/masks/fill";
import type { EffectPass } from "@/effects/types";
import { buildGaussianBlurPasses } from "@/effects/definitions/blur";
import { incrementCounter } from "@/diagnostics/render-perf";
import type { AnyBaseNode } from "../nodes/base-node";
import type { CanvasRenderer } from "../canvas-renderer";
import { createCanvasSurface } from "../canvas-utils";
import { BlurBackgroundNode } from "../nodes/blur-background-node";
import { ColorNode } from "../nodes/color-node";
import { EffectLayerNode } from "../nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "../nodes/graphic-node";
import { ImageNode } from "../nodes/image-node";
import { RootNode } from "../nodes/root-node";
import { StickerNode } from "../nodes/sticker-node";
import { renderTextToContext, TextNode } from "../nodes/text-node";
import { TransitionNode } from "../nodes/transition-node";
import { VideoNode } from "../nodes/video-node";
import type { ResolvedVisualSourceNodeState } from "../nodes/visual-node";
import type {
	FrameDescriptor,
	FrameItemDescriptor,
	LayerMaskDescriptor,
	QuadTransformDescriptor,
	TextureCanvasDrawFn,
	TextureUploadDescriptor,
} from "./types";
import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/graphics";

export async function buildFrameDescriptor({
	node,
	renderer,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
}): Promise<{
	frame: FrameDescriptor;
	textures: TextureUploadDescriptor[];
}> {
	const items: FrameItemDescriptor[] = [];
	const textures = new Map<string, TextureUploadDescriptor>();

	await collectNode({
		node,
		renderer,
		path: "root",
		items,
		textures,
	});

	incrementCounter({ name: "frameItems", by: items.length });
	incrementCounter({ name: "frameTextures", by: textures.size });

	return {
		frame: {
			width: renderer.width,
			height: renderer.height,
			clear: {
				color: [0, 0, 0, 1],
			},
			items,
		},
		textures: [...textures.values()],
	};
}

async function collectNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}): Promise<void> {
	if (node instanceof RootNode) {
		// 전환 구간 안의 두 클립은 제자리에서 그리지 않고 전환 노드가 모아서 그린다
		const claimedByTransition = new Set<AnyBaseNode>();
		for (const child of node.children) {
			if (child instanceof TransitionNode && child.resolved) {
				claimedByTransition.add(child.params.from);
				claimedByTransition.add(child.params.to);
			}
		}
		const childPath = (child: AnyBaseNode) =>
			`${path}:${node.children.indexOf(child)}`;

		for (const child of node.children) {
			if (claimedByTransition.has(child)) continue;
			if (child instanceof TransitionNode) {
				if (!child.resolved) continue;
				const fromItems: FrameItemDescriptor[] = [];
				const toItems: FrameItemDescriptor[] = [];
				await collectNode({
					node: child.params.from,
					renderer,
					path: childPath(child.params.from),
					items: fromItems,
					textures,
				});
				await collectNode({
					node: child.params.to,
					renderer,
					path: childPath(child.params.to),
					items: toItems,
					textures,
				});
				items.push({
					type: "transition",
					kind: child.params.type,
					progress: child.resolved.progress,
					fromItems,
					toItems,
				});
				continue;
			}
			await collectNode({
				node: child,
				renderer,
				path: childPath(child),
				items,
				textures,
			});
		}
		return;
	}

	if (node instanceof ColorNode) {
		const textureId = `${path}:color`;
		const { width, height } = renderer;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash: `color:${node.params.color}:${width}x${height}`,
			width,
			height,
			draw: (ctx) => {
				if (/gradient\(/i.test(node.params.color)) {
					drawCssBackground({ ctx, width, height, css: node.params.color });
				} else {
					ctx.fillStyle = node.params.color;
					ctx.fillRect(0, 0, width, height);
				}
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [],
			mask: null,
		});
		return;
	}

	if (node instanceof EffectLayerNode) {
		if (!node.resolved || node.resolved.passes.length === 0) {
			return;
		}
		items.push({
			type: "sceneEffect",
			effectPassGroups: [node.resolved.passes],
		});
		return;
	}

	if (node instanceof BlurBackgroundNode) {
		if (!node.resolved) {
			return;
		}
		const textureId = `${path}:blur-background`;
		const { width, height } = renderer;
		const { backdropSource, passes } = node.resolved;
		// Backdrop pixels come from a decoded video/image frame whose identity
		// already changes when it changes. Hashing the source reference is
		// enough to let us skip redraws on frozen frames.
		const contentHash = `blur:${identityKey(backdropSource.source)}:${backdropSource.width}x${backdropSource.height}:${width}x${height}`;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash,
			width,
			height,
			draw: (ctx) => {
				const coverScale = Math.max(
					width / backdropSource.width,
					height / backdropSource.height,
				);
				const scaledWidth = backdropSource.width * coverScale;
				const scaledHeight = backdropSource.height * coverScale;
				const offsetX = (width - scaledWidth) / 2;
				const offsetY = (height - scaledHeight) / 2;
				ctx.drawImage(
					backdropSource.source,
					offsetX,
					offsetY,
					scaledWidth,
					scaledHeight,
				);
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [passes],
			mask: null,
		});
		return;
	}

	if (
		node instanceof VideoNode ||
		node instanceof ImageNode ||
		node instanceof StickerNode ||
		node instanceof GraphicNode
	) {
		await collectVisualSourceNode({
			node,
			renderer,
			path,
			items,
			textures,
		});
		return;
	}

	if (node instanceof TextNode) {
		collectTextNode({
			node,
			renderer,
			path,
			items,
			textures,
		});
	}
}

async function collectVisualSourceNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: VideoNode | ImageNode | StickerNode | GraphicNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}) {
	if (!node.resolved) {
		return;
	}

	const source =
		node instanceof GraphicNode
			? node.getSource({ resolvedParams: node.resolved.resolvedParams })
			: node.resolved.source;
	if (!source) {
		return;
	}

	const sourceWidth =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceWidth;
	const sourceHeight =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceHeight;

	const textureId = `${path}:source`;
	textures.set(textureId, {
		kind: "external",
		id: textureId,
		source,
		width: sourceWidth,
		height: sourceHeight,
	});

	const transform = computeVisualTransform({
		renderer,
		resolved: node.resolved,
		sourceWidth,
		sourceHeight,
	});
	const { mask, clipMasks, effectMasks, strokeLayers } = buildMaskArtifacts({
		node,
		renderer,
		path,
		transform,
		textures,
	});

	items.push({
		type: "layer",
		textureId,
		transform,
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask,
	});
	items.push(
		...buildEffectMaskLayers({
			node,
			renderer,
			path,
			transform,
			textures,
			source,
			sourceTextureId: textureId,
			sourceWidth,
			sourceHeight,
			clipMasks,
			effectMasks,
		}),
		...strokeLayers,
	);
}

function collectTextNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: TextNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}) {
	if (!node.resolved) {
		return;
	}

	const textureId = `${path}:text`;
	const { width, height } = renderer;
	// Text output is fully determined by node.params + node.resolved. Both are
	// plain data we can stringify cheaply; the resolved measured layout is the
	// expensive part of text setup, so stringifying it here is orders of
	// magnitude cheaper than re-rasterizing when nothing changed.
	const contentHash = `text:${width}x${height}:${JSON.stringify({
		params: node.params,
		resolved: node.resolved,
	})}`;
	textures.set(textureId, {
		kind: "rendered",
		id: textureId,
		contentHash,
		width,
		height,
		draw: (ctx) => {
			renderTextToContext({ node, ctx });
		},
	});
	items.push({
		type: "layer",
		textureId,
		transform: fullCanvasTransform(renderer),
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask: null,
	});
}

function computeVisualTransform({
	renderer,
	resolved,
	sourceWidth,
	sourceHeight,
}: {
	renderer: CanvasRenderer;
	resolved: ResolvedVisualSourceNodeState | ResolvedGraphicNodeState;
	sourceWidth: number;
	sourceHeight: number;
}): QuadTransformDescriptor {
	const containScale = Math.min(
		renderer.width / sourceWidth,
		renderer.height / sourceHeight,
	);
	const scaledWidth = sourceWidth * containScale * resolved.transform.scaleX;
	const scaledHeight = sourceHeight * containScale * resolved.transform.scaleY;
	const absWidth = Math.abs(scaledWidth);
	const absHeight = Math.abs(scaledHeight);

	return {
		centerX: renderer.width / 2 + resolved.transform.position.x,
		centerY: renderer.height / 2 + resolved.transform.position.y,
		width: absWidth,
		height: absHeight,
		rotationDegrees: resolved.transform.rotate,
		flipX: scaledWidth < 0,
		flipY: scaledHeight < 0,
	};
}

function fullCanvasTransform(
	renderer: CanvasRenderer,
): QuadTransformDescriptor {
	return {
		centerX: renderer.width / 2,
		centerY: renderer.height / 2,
		width: renderer.width,
		height: renderer.height,
		rotationDegrees: 0,
		flipX: false,
		flipY: false,
	};
}

type MaskOwnerNode = VideoNode | ImageNode | StickerNode | GraphicNode;

/** smoothstep(-f/2, f/2)의 10~90% 전이 폭(0.608f)과 가우시안 10~90% 폭(2.563σ)을 맞춘 비율 */
const FEATHER_TO_BLUR_SIGMA = 0.237;

const BLEND_COMPOSITE_OPS: Record<
	MaskBlendMode,
	GlobalCompositeOperation
> = {
	add: "source-over",
	subtract: "destination-out",
	intersect: "destination-in",
};

/**
 * 보이는 마스크를 clip과 효과(mosaic·blur)로 나눠 처리한다.
 * clip 마스크가 하나뿐이면 예전처럼 GPU 페더를 쓰는 단일 마스크 경로를 그대로 탄다.
 * 여러 개면 마스크마다 페더·반전을 미리 구운 뒤 캔버스에서 합성 방식대로 합친다
 */
function buildMaskArtifacts({
	node,
	renderer,
	path,
	transform,
	textures,
}: {
	node: MaskOwnerNode;
	renderer: CanvasRenderer;
	path: string;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
}): {
	mask: LayerMaskDescriptor | null;
	clipMasks: Mask[];
	effectMasks: Mask[];
	strokeLayers: FrameItemDescriptor[];
} {
	const activeMasks = getVisibleMasks(node.resolved?.masks).filter(
		(mask) =>
			getMaskDefinition(mask.type).isActive?.(mask.params) !== false,
	);
	const clipMasks = activeMasks.filter(
		(mask) => !isEffectFill(getMaskFill(mask)),
	);
	const effectMasks = activeMasks.filter((mask) =>
		isEffectFill(getMaskFill(mask)),
	);
	const strokeLayers = activeMasks.flatMap((mask) => {
		const layer = buildStrokeLayer({ mask, renderer, path, transform, textures });
		return layer ? [layer] : [];
	});

	if (clipMasks.length === 0) {
		return { mask: null, clipMasks, effectMasks, strokeLayers };
	}

	if (clipMasks.length === 1) {
		return {
			mask: buildSingleMaskTexture({
				mask: clipMasks[0],
				textureId: `${path}:mask`,
				renderer,
				transform,
				textures,
			}),
			clipMasks,
			effectMasks,
			strokeLayers,
		};
	}

	const textureId = `${path}:mask`;
	const { width, height } = renderer;
	textures.set(textureId, {
		kind: "rendered",
		id: textureId,
		contentHash: `masks:${maskSetHash(clipMasks)}:${transformHash(transform)}:${width}x${height}`,
		width,
		height,
		draw: (ctx) => {
			ctx.drawImage(
				composeClipMasks({ masks: clipMasks, transform, width, height }),
				0,
				0,
			);
		},
	});
	return {
		mask: { textureId, feather: 0, inverted: false },
		clipMasks,
		effectMasks,
		strokeLayers,
	};
}

/**
 * 모자이크·블러 마스크마다 같은 원본을 효과를 입혀 한 장 더 그리고 그 마스크로 자른다.
 * clip 마스크가 있으면 그 바깥까지 효과가 새지 않도록 clip 결과와 겹친 곳만 남긴다
 */
function buildEffectMaskLayers({
	node,
	renderer,
	path,
	transform,
	textures,
	source,
	sourceTextureId,
	sourceWidth,
	sourceHeight,
	clipMasks,
	effectMasks,
}: {
	node: MaskOwnerNode;
	renderer: CanvasRenderer;
	path: string;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
	source: CanvasImageSource;
	sourceTextureId: string;
	sourceWidth: number;
	sourceHeight: number;
	clipMasks: Mask[];
	effectMasks: Mask[];
}): FrameItemDescriptor[] {
	if (!node.resolved) return [];
	const { width, height } = renderer;

	return effectMasks.map((mask) => {
		const fill = getMaskFill(mask);
		const strengthPx = fillStrengthToPixels({
			strength: mask.params.fillStrength,
			canvasWidth: width,
		});
		const maskTextureId = `${path}:effect-mask:${mask.id}`;
		const maskDescriptor: LayerMaskDescriptor =
			clipMasks.length === 0
				? buildSingleMaskTexture({
						mask,
						textureId: maskTextureId,
						renderer,
						transform,
						textures,
					})
				: (() => {
						textures.set(maskTextureId, {
							kind: "rendered",
							id: maskTextureId,
							contentHash: `effect-mask:${maskSetHash([mask])}:${maskSetHash(clipMasks)}:${transformHash(transform)}:${width}x${height}`,
							width,
							height,
							draw: (ctx) => {
								ctx.drawImage(
									renderBakedMask({ mask, transform, width, height }),
									0,
									0,
								);
								ctx.globalCompositeOperation = "destination-in";
								ctx.drawImage(
									composeClipMasks({
										masks: clipMasks,
										transform,
										width,
										height,
									}),
									0,
									0,
								);
								ctx.globalCompositeOperation = "source-over";
							},
						});
						return { textureId: maskTextureId, feather: 0, inverted: false };
					})();

		let textureId = sourceTextureId;
		let extraPasses: EffectPass[][] = [];
		if (fill === "mosaic") {
			// 화면 기준 칸 크기를 원본 픽셀로 바꿔서, 원본을 줄였다가 계단지게 다시 키운다
			const blockPx = Math.max(
				1,
				(strengthPx * sourceWidth) / Math.max(1, transform.width),
			);
			textureId = `${path}:mosaic:${mask.id}`;
			textures.set(textureId, {
				kind: "rendered",
				id: textureId,
				contentHash: `mosaic:${identityKey(source)}:${blockPx}:${sourceWidth}x${sourceHeight}`,
				width: sourceWidth,
				height: sourceHeight,
				draw: (ctx) => {
					const small = createCanvasSurface({
						width: Math.max(1, Math.ceil(sourceWidth / blockPx)),
						height: Math.max(1, Math.ceil(sourceHeight / blockPx)),
					});
					small.context.drawImage(
						source,
						0,
						0,
						small.canvas.width,
						small.canvas.height,
					);
					ctx.imageSmoothingEnabled = false;
					ctx.drawImage(small.canvas, 0, 0, sourceWidth, sourceHeight);
				},
			});
		} else {
			const sigma = (strengthPx * sourceWidth) / Math.max(1, transform.width);
			extraPasses = [buildGaussianBlurPasses({ sigmaX: sigma, sigmaY: sigma })];
		}

		return {
			type: "layer",
			textureId,
			transform,
			opacity: node.resolved?.opacity ?? 1,
			blendMode: node.params.blendMode ?? "normal",
			effectPassGroups: [...(node.resolved?.effectPasses ?? []), ...extraPasses],
			mask: maskDescriptor,
		};
	});
}

function maskSetHash(masks: Mask[]): string {
	return masks
		.map(
			(mask) =>
				`${mask.type}:${mask.blend ?? "add"}:${JSON.stringify(mask.params)}`,
		)
		.join("|");
}

/** drawWithFeather 마스크는 캔버스 그림에 페더가 이미 들어 있어 GPU 페더를 건너뛴다 */
function getGpuFeather(mask: Mask): number {
	const { body } = getMaskDefinition(mask.type).renderer;
	return body.kind === "drawWithFeather" ? 0 : mask.params.feather;
}

/** 요소 크기 캔버스에 마스크 모양을 흰색으로 그린다 */
function drawElementMaskShape({
	mask,
	transform,
}: {
	mask: Mask;
	transform: QuadTransformDescriptor;
}): OffscreenCanvas {
	const { body } = getMaskDefinition(mask.type).renderer;
	const usesOpaqueFastPath =
		body.kind === "drawWithFeather" &&
		mask.params.feather === 0 &&
		Boolean(body.opaqueFastPath);
	const { canvas, context } = createCanvasSurface({
		width: Math.max(1, Math.round(transform.width)),
		height: Math.max(1, Math.round(transform.height)),
	});

	switch (body.kind) {
		case "fillPath": {
			const path2d = body.buildPath({
				resolvedParams: mask.params,
				width: transform.width,
				height: transform.height,
			});
			context.fillStyle = "white";
			context.fill(path2d);
			break;
		}
		case "drawOpaque":
			body.drawOpaque({
				resolvedParams: mask.params,
				ctx: context,
				width: Math.round(transform.width),
				height: Math.round(transform.height),
			});
			break;
		case "drawWithFeather":
			if (usesOpaqueFastPath && body.opaqueFastPath) {
				const path2d = body.opaqueFastPath.buildPath({
					resolvedParams: mask.params,
					width: transform.width,
					height: transform.height,
				});
				context.fillStyle = "white";
				context.fill(path2d);
			} else {
				body.drawWithFeather({
					resolvedParams: mask.params,
					ctx: context,
					width: Math.round(transform.width),
					height: Math.round(transform.height),
					feather: mask.params.feather,
				});
			}
			break;
	}
	return canvas;
}

/** 마스크 하나를 화면 크기 텍스처로 올리고, 페더·반전은 GPU 컴포지터에 맡긴다 */
function buildSingleMaskTexture({
	mask,
	textureId,
	renderer,
	transform,
	textures,
}: {
	mask: Mask;
	textureId: string;
	renderer: CanvasRenderer;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
}): LayerMaskDescriptor {
	const { body } = getMaskDefinition(mask.type).renderer;
	const { width, height } = renderer;
	textures.set(textureId, {
		kind: "rendered",
		id: textureId,
		contentHash: `mask:${mask.type}:${JSON.stringify(mask.params)}:${transformHash(transform)}:${width}x${height}:body=${body.kind}`,
		width,
		height,
		draw: (ctx) => {
			drawTransformedCanvas({
				ctx,
				source: drawElementMaskShape({ mask, transform }),
				transform,
			});
		},
	});
	return {
		textureId,
		feather: getGpuFeather(mask),
		inverted: mask.params.inverted,
	};
}

/** 합성용으로 페더와 반전까지 적용한 화면 크기 마스크 */
function renderBakedMask({
	mask,
	transform,
	width,
	height,
}: {
	mask: Mask;
	transform: QuadTransformDescriptor;
	width: number;
	height: number;
}): OffscreenCanvas {
	const surface = createCanvasSurface({ width, height });
	drawTransformedCanvas({
		ctx: surface.context,
		source: drawElementMaskShape({ mask, transform }),
		transform,
	});
	// GPU 페더(applyMaskFeather)는 WebGPU 캔버스를 돌려주는데, 2D 캔버스에 그리면 알파가 빠져 마스크가 통째로 불투명해진다.
	// 그래서 합성 경로에서는 같은 전이 폭을 내는 가우시안 블러로 페더를 만든다
	const feather = getGpuFeather(mask);
	let feathered = surface.canvas;
	if (feather > 0) {
		const blurred = createCanvasSurface({ width, height });
		blurred.context.filter = `blur(${feather * FEATHER_TO_BLUR_SIGMA}px)`;
		blurred.context.drawImage(surface.canvas, 0, 0);
		feathered = blurred.canvas;
	}
	if (!mask.params.inverted) return feathered;

	const inverted = createCanvasSurface({ width, height });
	inverted.context.fillStyle = "white";
	inverted.context.fillRect(0, 0, width, height);
	inverted.context.globalCompositeOperation = "destination-out";
	inverted.context.drawImage(feathered, 0, 0);
	return inverted.canvas;
}

function composeClipMasks({
	masks,
	transform,
	width,
	height,
}: {
	masks: Mask[];
	transform: QuadTransformDescriptor;
	width: number;
	height: number;
}): OffscreenCanvas {
	const { canvas, context } = createCanvasSurface({ width, height });
	masks.forEach((mask, index) => {
		context.globalCompositeOperation =
			index === 0 ? "source-over" : BLEND_COMPOSITE_OPS[getMaskBlend(mask)];
		context.drawImage(
			renderBakedMask({ mask, transform, width, height }),
			0,
			0,
		);
	});
	return canvas;
}

function buildStrokeLayer({
	mask,
	renderer,
	path,
	transform,
	textures,
}: {
	mask: Mask;
	renderer: CanvasRenderer;
	path: string;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
}): FrameItemDescriptor | null {
	const stroke = getMaskDefinition(mask.type).renderer.stroke;
	if (!stroke || mask.params.strokeWidth <= 0) {
		return null;
	}

	const { width: canvasWidth, height: canvasHeight } = renderer;
	const strokeTextureId = `${path}:mask-stroke:${mask.id}`;
	const strokeContentHash = `stroke:${mask.type}:${JSON.stringify(mask.params)}:${transformHash(transform)}:${canvasWidth}x${canvasHeight}:stroke=${stroke.kind}`;
	const drawStroke: TextureCanvasDrawFn = (ctx) => {
		const { canvas: strokeCanvas, context: strokeCtx } = createCanvasSurface({
			width: Math.round(transform.width),
			height: Math.round(transform.height),
		});

		switch (stroke.kind) {
			case "renderStroke":
				stroke.renderStroke({
					resolvedParams: mask.params,
					ctx: strokeCtx,
					width: transform.width,
					height: transform.height,
				});
				break;
			case "strokeFromPath": {
				const strokePath = stroke.buildStrokePath({
					resolvedParams: mask.params,
					width: transform.width,
					height: transform.height,
				});
				strokeCtx.strokeStyle = mask.params.strokeColor;
				strokeCtx.lineWidth = mask.params.strokeWidth;
				strokeCtx.stroke(strokePath);
				break;
			}
		}

		drawTransformedCanvas({ ctx, source: strokeCanvas, transform });
	};
	textures.set(strokeTextureId, {
		kind: "rendered",
		id: strokeTextureId,
		contentHash: strokeContentHash,
		width: canvasWidth,
		height: canvasHeight,
		draw: drawStroke,
	});
	return {
		type: "layer",
		textureId: strokeTextureId,
		transform: fullCanvasTransform(renderer),
		opacity: 1,
		blendMode: "normal",
		effectPassGroups: [],
		mask: null,
	};
}

function drawTransformedCanvas({
	ctx,
	source,
	transform,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	source: CanvasImageSource;
	transform: QuadTransformDescriptor;
}) {
	const x = transform.centerX - transform.width / 2;
	const y = transform.centerY - transform.height / 2;
	const flipX = transform.flipX ? -1 : 1;
	const flipY = transform.flipY ? -1 : 1;
	const requiresTransform =
		transform.rotationDegrees !== 0 || flipX !== 1 || flipY !== 1;

	ctx.save();
	if (requiresTransform) {
		ctx.translate(transform.centerX, transform.centerY);
		ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
		ctx.scale(flipX, flipY);
		ctx.translate(-transform.centerX, -transform.centerY);
	}
	ctx.drawImage(source, x, y, transform.width, transform.height);
	ctx.restore();
}

function transformHash(transform: QuadTransformDescriptor): string {
	return `${transform.centerX}:${transform.centerY}:${transform.width}:${transform.height}:${transform.rotationDegrees}:${transform.flipX ? 1 : 0}:${transform.flipY ? 1 : 0}`;
}

// Stable identity key for CanvasImageSource. Using a WeakMap → counter keeps
// hash string length bounded and avoids holding sources alive.
const identityKeys = new WeakMap<object, number>();
let nextIdentity = 1;
function identityKey(source: CanvasImageSource): string {
	if (typeof source === "object" && source !== null) {
		let key = identityKeys.get(source);
		if (key === undefined) {
			key = nextIdentity++;
			identityKeys.set(source, key);
		}
		return `@${key}`;
	}
	return "@?";
}
