import { beforeEach, describe, expect, test } from "bun:test";
import { useTextStylePresets } from "../style-presets";

describe("useTextStylePresets", () => {
	beforeEach(() => useTextStylePresets.setState({ presets: [] }));

	test("저장한 순서대로 쌓이고 이름을 바꾸거나 지울 수 있다", () => {
		const { add } = useTextStylePresets.getState();
		const first = add({ name: "노란 자막", style: { color: "#ffff00" } });
		add({ name: "", style: { color: "#ffffff" } });

		useTextStylePresets.getState().rename({ id: first, name: "  예능 자막 " });
		expect(
			useTextStylePresets
				.getState()
				.presets.map(({ name, style }) => ({ name, style })),
		).toEqual([
			{ name: "예능 자막", style: { color: "#ffff00" } },
			{ name: "Style 2", style: { color: "#ffffff" } },
		]);

		useTextStylePresets.getState().remove({ id: first });
		expect(
			useTextStylePresets.getState().presets.map((preset) => preset.name),
		).toEqual(["Style 2"]);
	});

	test("빈 이름으로는 바꾸지 않는다", () => {
		const id = useTextStylePresets.getState().add({ name: "기본", style: {} });
		useTextStylePresets.getState().rename({ id, name: "   " });
		expect(useTextStylePresets.getState().presets[0].name).toBe("기본");
	});
});
