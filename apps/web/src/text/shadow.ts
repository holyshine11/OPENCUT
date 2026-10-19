import type { ParamValues } from "@/params";

// 흐림과 거리는 글자 크기 대비 %, 투명도는 0~100
export const DEFAULT_TEXT_SHADOW = {
	enabled: false,
	color: "#000000",
	opacity: 60,
	blur: 15,
	offsetX: 5,
	offsetY: 5,
};

export interface TextShadow {
	color: string;
	blur: number;
	offsetX: number;
	offsetY: number;
}

const numberParam = ({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}) => (typeof value === "number" ? value : fallback);

/** #rgb, #rrggbb 색에 투명도를 붙인다. 다른 형식은 투명도 없이 그대로 쓴다 */
function withOpacity({
	color,
	opacity,
}: {
	color: string;
	opacity: number;
}): string {
	const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
	if (!hex) return color;
	const full =
		hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
	const [r, g, b] = [0, 2, 4].map((offset) =>
		Number.parseInt(full.slice(offset, offset + 2), 16),
	);
	return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

export function resolveTextShadow({
	params,
}: {
	params: ParamValues;
}): TextShadow | null {
	if (params["shadow.enabled"] !== true) return null;
	const color =
		typeof params["shadow.color"] === "string"
			? params["shadow.color"]
			: DEFAULT_TEXT_SHADOW.color;
	return {
		color: withOpacity({
			color,
			opacity: numberParam({
				value: params["shadow.opacity"],
				fallback: DEFAULT_TEXT_SHADOW.opacity,
			}),
		}),
		blur: numberParam({
			value: params["shadow.blur"],
			fallback: DEFAULT_TEXT_SHADOW.blur,
		}),
		offsetX: numberParam({
			value: params["shadow.offsetX"],
			fallback: DEFAULT_TEXT_SHADOW.offsetX,
		}),
		offsetY: numberParam({
			value: params["shadow.offsetY"],
			fallback: DEFAULT_TEXT_SHADOW.offsetY,
		}),
	};
}
