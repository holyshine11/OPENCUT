import { beforeAll, describe, expect, test } from "bun:test";
import { masksRegistry, registerDefaultMasks } from "@/masks";
import {
	buildMaskWithFill,
	duplicateMaskInList,
	getVisibleMasks,
	moveMaskInList,
	nextMaskName,
	patchMaskMeta,
	removeMaskFromList,
	resetMaskInList,
} from "@/masks/list-ops";
import type { Mask } from "@/masks/types";
import { withMaskParams } from "@/masks/with-params";

beforeAll(() => {
	if (!masksRegistry.has("rectangle")) registerDefaultMasks();
});

function rect(name: string): Mask {
	return buildMaskWithFill({ maskType: "rectangle", fill: "clip", name });
}

describe("mask list ops", () => {
	test("duplicate inserts a deep copy right after the source", () => {
		const a = rect("A");
		const b = rect("B");
		const { masks, newId } = duplicateMaskInList({
			masks: [a, b],
			maskId: a.id,
			name: "A 2",
		});
		expect(masks.map((mask) => mask.name)).toEqual(["A", "A 2", "B"]);
		expect(newId).not.toBe(a.id);
		expect(masks[1].params).not.toBe(a.params);
		expect(masks[1].params).toEqual(a.params);
	});

	test("move swaps neighbours and ignores out-of-range moves", () => {
		const [a, b, c] = [rect("A"), rect("B"), rect("C")];
		const moved = moveMaskInList({ masks: [a, b, c], maskId: c.id, offset: -1 });
		expect(moved.map((mask) => mask.name)).toEqual(["A", "C", "B"]);
		const same = [a, b, c];
		expect(moveMaskInList({ masks: same, maskId: a.id, offset: -1 })).toBe(same);
	});

	test("reset restores shape params but keeps identity and meta", () => {
		const base = buildMaskWithFill({
			maskType: "rectangle",
			fill: "mosaic",
			name: "Face",
		});
		const edited: Mask = {
			...withMaskParams({ mask: base, patch: { centerX: 0.4, feather: 30 } }),
			hidden: true,
			blend: "subtract",
		};
		const [reset] = resetMaskInList({ masks: [edited], maskId: edited.id });
		expect(reset.id).toBe(edited.id);
		expect(reset.name).toBe("Face");
		expect(reset.fill).toBe("mosaic");
		expect(reset.hidden).toBe(true);
		expect(reset.blend).toBe("subtract");
		expect(reset.params).toEqual(base.params);
	});

	test("hidden masks drop out of the visible list", () => {
		const a = rect("A");
		const b = rect("B");
		const masks = patchMaskMeta({
			masks: [a, b],
			maskId: a.id,
			patch: { hidden: true },
		});
		expect(getVisibleMasks(masks).map((mask) => mask.name)).toEqual(["B"]);
		expect(removeMaskFromList({ masks, maskId: b.id })).toHaveLength(1);
	});

	test("next name skips taken numbers", () => {
		expect(
			nextMaskName({ masks: [rect("Mosaic 1"), rect("Mosaic 3")], baseName: "Mosaic" }),
		).toBe("Mosaic 2");
	});
});
