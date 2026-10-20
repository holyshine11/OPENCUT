import { beforeEach, expect, test } from "bun:test";
import type { SceneTracks, TextElement } from "@/timeline";
import {
	getRememberedCaptionStyle,
	getRememberedTextStyle,
	rememberTextStyles,
	useTextStyleMemory,
} from "../style-memory";

const LANDSCAPE = { width: 1920, height: 1080 };
const PORTRAIT = { width: 1080, height: 1920 };

function text({
	id,
	name,
	color,
	content = "hi",
	fontSize = 5,
}: {
	id: string;
	name: string;
	color: string;
	content?: string;
	fontSize?: number;
}) {
	return {
		id,
		name,
		type: "text",
		params: {
			content,
			color,
			fontSize,
			fontFamily: "Pretendard",
			"transform.positionY": 400,
			opacity: 1,
		},
	} as unknown as TextElement;
}

function tracksOf(...elements: TextElement[]) {
	return [{ elements }] as unknown as SceneTracks;
}

const EMPTY = tracksOf();

beforeEach(() => {
	useTextStyleMemory.setState({ last: {}, captionForm: undefined });
});

test("captions and plain text are remembered separately, without content", () => {
	const tracks = [
		{ elements: [text({ id: "a", name: "Caption 1", color: "#ff0" })] },
		{ elements: [text({ id: "b", name: "Title", color: "#0ff" })] },
	] as unknown as SceneTracks;

	rememberTextStyles({
		before: EMPTY,
		tracks,
		elementIds: new Set(["a", "b"]),
		canvasSize: LANDSCAPE,
	});

	expect(getRememberedTextStyle({ slot: "caption" })).toEqual({});
	expect(getRememberedTextStyle({ slot: "text" })).toEqual({
		color: "#0ff",
		fontSize: 5,
		fontFamily: "Pretendard",
		"transform.positionY": 400,
	});

	rememberTextStyles({
		before: EMPTY,
		tracks,
		elementIds: new Set(["a"]),
		canvasSize: LANDSCAPE,
	});
	expect(getRememberedTextStyle({ slot: "caption" }).color).toBe("#ff0");
});

test("고친 게 글자뿐이면 기억한 스타일을 덮어쓰지 않는다", () => {
	const styled = text({ id: "a", name: "Caption 1", color: "#ff0" });
	rememberTextStyles({
		before: EMPTY,
		tracks: tracksOf(styled),
		elementIds: new Set(["a"]),
		canvasSize: LANDSCAPE,
	});

	// 스타일을 바꾸지 않은 옛 자막의 오타만 고친다
	const plain = text({ id: "b", name: "Caption 2", color: "#fff" });
	const fixed = text({
		id: "b",
		name: "Caption 2",
		color: "#fff",
		content: "fixed",
	});
	rememberTextStyles({
		before: tracksOf(styled, plain),
		tracks: tracksOf(styled, fixed),
		elementIds: new Set(["b"]),
		canvasSize: LANDSCAPE,
	});

	expect(getRememberedTextStyle({ slot: "caption" }).color).toBe("#ff0");
});

test("다른 형식에서 기억한 자막은 글꼴 크기와 위치를 빼고 쓴다", () => {
	rememberTextStyles({
		before: EMPTY,
		tracks: tracksOf(
			text({ id: "a", name: "Caption 1", color: "#ff0", fontSize: 7 }),
		),
		elementIds: new Set(["a"]),
		canvasSize: LANDSCAPE,
	});

	expect(getRememberedCaptionStyle({ canvasSize: LANDSCAPE })).toMatchObject({
		color: "#ff0",
		fontSize: 7,
		"transform.positionY": 400,
	});
	expect(getRememberedCaptionStyle({ canvasSize: PORTRAIT })).toEqual({
		color: "#ff0",
		fontFamily: "Pretendard",
	});
});
