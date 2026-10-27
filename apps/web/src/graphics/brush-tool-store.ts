import { create } from "zustand";
import type { NumberParamDefinition } from "@/params";

export type BrushTool = "draw" | "move" | "erase";

export const ERASER_SIZE_PARAM: NumberParamDefinition = {
	key: "eraserSize",
	label: "Eraser size",
	type: "number",
	default: 24,
	min: 1,
	max: 200,
	step: 1,
	shortLabel: "W",
	slider: true,
};

interface BrushToolStore {
	tool: BrushTool;
	setTool: (tool: BrushTool) => void;
	/** 캔버스 px */
	eraserSize: number;
	setEraserSize: (size: number) => void;
}

export const useBrushToolStore = create<BrushToolStore>()((set) => ({
	tool: "draw",
	setTool: (tool) => set({ tool }),
	eraserSize: ERASER_SIZE_PARAM.default,
	setEraserSize: (eraserSize) => set({ eraserSize }),
}));
