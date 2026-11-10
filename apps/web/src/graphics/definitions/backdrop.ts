import { DEFAULT_FILL_STRENGTH } from "@/masks/fill";
import type { ParamDefinition } from "@/params";
import type { GraphicDefinition, GraphicRenderContext } from "../types";

const BACKDROP_PARAMS: ParamDefinition<"strength" | "cornerRadius">[] = [
	{
		key: "strength",
		label: "Strength",
		type: "number",
		default: DEFAULT_FILL_STRENGTH,
		min: 1,
		max: 100,
		step: 1,
		slider: true,
	},
	{
		key: "cornerRadius",
		label: "Corner radius",
		type: "number",
		default: 0,
		min: 0,
		max: 50,
		step: 1,
		shortLabel: "R",
	},
];

const THUMBNAIL_CELLS = 4;
const THUMBNAIL_SHADES = ["#8a8a8a", "#b5b5b5", "#6e6e6e", "#a0a0a0"];

/**
 * 합성기는 이 그림의 알파만 영역으로 쓴다. 색은 에셋 패널 썸네일에서
 * 블러와 모자이크를 구별하려고 칠한다
 */
function renderBackdropShape({
	ctx,
	params,
	width,
	height,
	paint,
}: GraphicRenderContext & { paint: () => void }): void {
	const radiusPercent = Math.min(
		50,
		Math.max(0, Number(params.cornerRadius ?? 0)),
	);
	const radius = (Math.min(width, height) / 2) * (radiusPercent / 50);

	ctx.clearRect(0, 0, width, height);
	ctx.save();
	const path = new Path2D();
	path.roundRect(0, 0, width, height, radius);
	ctx.clip(path);
	paint();
	ctx.restore();
}

export const blurGraphicDefinition: GraphicDefinition = {
	id: "blur",
	name: "Blur",
	keywords: ["blur", "hide", "censor", "블러", "흐림", "가리기"],
	params: BACKDROP_PARAMS,
	backdropFill: "blur",
	render(context) {
		const { ctx, width, height } = context;
		renderBackdropShape({
			...context,
			paint: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				THUMBNAIL_SHADES.forEach((shade, index) => {
					gradient.addColorStop(index / (THUMBNAIL_SHADES.length - 1), shade);
				});
				ctx.fillStyle = gradient;
				ctx.fillRect(0, 0, width, height);
			},
		});
	},
};

export const mosaicGraphicDefinition: GraphicDefinition = {
	id: "mosaic",
	name: "Mosaic",
	keywords: ["mosaic", "pixelate", "hide", "censor", "모자이크", "가리기"],
	params: BACKDROP_PARAMS,
	backdropFill: "mosaic",
	render(context) {
		const { ctx, width, height } = context;
		renderBackdropShape({
			...context,
			paint: () => {
				const cellWidth = width / THUMBNAIL_CELLS;
				const cellHeight = height / THUMBNAIL_CELLS;
				for (let row = 0; row < THUMBNAIL_CELLS; row++) {
					for (let column = 0; column < THUMBNAIL_CELLS; column++) {
						ctx.fillStyle =
							THUMBNAIL_SHADES[(row * 3 + column) % THUMBNAIL_SHADES.length];
						ctx.fillRect(
							column * cellWidth,
							row * cellHeight,
							Math.ceil(cellWidth),
							Math.ceil(cellHeight),
						);
					}
				}
			},
		});
	},
};
