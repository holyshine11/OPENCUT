import { buildDefaultMaskInstance } from "@/masks";
import type { Mask, MaskFill, MaskMeta } from "@/masks/types";
import { generateUUID } from "@/utils/id";

/** 마스크 목록을 바꾸는 순수 함수 모음. 결과 배열을 updateMasks로 넘기면 한 번에 undo된다 */

export function patchMaskMeta({
	masks,
	maskId,
	patch,
}: {
	masks: Mask[];
	maskId: string;
	patch: MaskMeta;
}): Mask[] {
	return masks.map((mask) =>
		mask.id === maskId ? { ...mask, ...patch } : mask,
	);
}

export function duplicateMaskInList({
	masks,
	maskId,
	name,
}: {
	masks: Mask[];
	maskId: string;
	name?: string;
}): { masks: Mask[]; newId: string | null } {
	const index = masks.findIndex((mask) => mask.id === maskId);
	if (index < 0) return { masks, newId: null };
	const copy: Mask = { ...structuredClone(masks[index]), id: generateUUID() };
	if (name !== undefined) copy.name = name;
	return {
		masks: [...masks.slice(0, index + 1), copy, ...masks.slice(index + 1)],
		newId: copy.id,
	};
}

/** 모양 파라미터만 기본값으로 되돌리고 id·이름·채우기·합성 방식은 남긴다 */
export function resetMaskInList({
	masks,
	maskId,
	elementSize,
}: {
	masks: Mask[];
	maskId: string;
	elementSize?: { width: number; height: number };
}): Mask[] {
	return masks.map((mask) => {
		if (mask.id !== maskId) return mask;
		const fresh = buildDefaultMaskInstance({
			maskType: mask.type,
			elementSize,
		});
		return {
			...fresh,
			id: mask.id,
			name: mask.name,
			hidden: mask.hidden,
			blend: mask.blend,
			fill: mask.fill,
		} as Mask;
	});
}

export function moveMaskInList({
	masks,
	maskId,
	offset,
}: {
	masks: Mask[];
	maskId: string;
	offset: number;
}): Mask[] {
	const from = masks.findIndex((mask) => mask.id === maskId);
	const to = from + offset;
	if (from < 0 || to < 0 || to >= masks.length) return masks;
	const next = [...masks];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

export function removeMaskFromList({
	masks,
	maskId,
}: {
	masks: Mask[];
	maskId: string;
}): Mask[] {
	return masks.filter((mask) => mask.id !== maskId);
}

export function getVisibleMasks(masks: Mask[] | undefined): Mask[] {
	return (masks ?? []).filter((mask) => !mask.hidden);
}

/** 새 마스크를 만들 때 붙일 이름. 같은 종류가 이미 있으면 번호를 올린다 */
export function nextMaskName({
	masks,
	baseName,
}: {
	masks: Mask[];
	baseName: string;
}): string {
	const taken = new Set(masks.map((mask) => mask.name));
	for (let n = 1; ; n++) {
		const candidate = `${baseName} ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

export function buildMaskWithFill({
	maskType,
	fill,
	name,
	elementSize,
}: {
	maskType: Mask["type"];
	fill: MaskFill;
	name: string;
	elementSize?: { width: number; height: number };
}): Mask {
	const mask = buildDefaultMaskInstance({ maskType, elementSize });
	return fill === "clip" ? { ...mask, name } : { ...mask, name, fill };
}

