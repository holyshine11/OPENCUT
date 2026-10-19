import { expect, test } from "bun:test";
import type { SceneTracks, TextElement } from "@/timeline";
import {
	getRememberedTextStyle,
	rememberTextStyles,
} from "../style-memory";

function text({ id, name, color }: { id: string; name: string; color: string }) {
	return {
		id,
		name,
		type: "text",
		params: { content: "hi", color, fontFamily: "Pretendard", opacity: 1 },
	} as unknown as TextElement;
}

test("captions and plain text are remembered separately, without content", () => {
	const tracks = {
		overlay: [
			{ elements: [text({ id: "a", name: "Caption 1", color: "#ff0" })] },
			{ elements: [text({ id: "b", name: "Title", color: "#0ff" })] },
		],
		main: { elements: [] },
		audio: [],
	} as unknown as SceneTracks;

	rememberTextStyles({ tracks, elementIds: new Set(["a", "b"]) });

	expect(getRememberedTextStyle({ slot: "caption" })).toEqual({});
	expect(getRememberedTextStyle({ slot: "text" })).toEqual({
		color: "#0ff",
		fontFamily: "Pretendard",
	});

	rememberTextStyles({ tracks, elementIds: new Set(["a"]) });
	expect(getRememberedTextStyle({ slot: "caption" }).color).toBe("#ff0");
});
