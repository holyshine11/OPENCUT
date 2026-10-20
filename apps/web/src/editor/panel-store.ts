import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PANEL_CONFIG } from "@/panels/layout";

export interface PanelSizes {
	tools: number;
	preview: number;
	properties: number;
	mainContent: number;
	timeline: number;
}

export type PanelId = keyof PanelSizes;

interface PanelState {
	panels: PanelSizes;
	setPanel: (args: { panel: PanelId; size: number }) => void;
	setPanels: (sizes: Partial<PanelSizes>) => void;
	resetPanels: () => void;
}

export const usePanelStore = create<PanelState>()(
	persist(
		(set) => ({
			...PANEL_CONFIG,
			setPanel: ({ panel, size }) =>
				set((state) => ({
					panels: {
						...state.panels,
						[panel]: size,
					},
				})),
			setPanels: (sizes) =>
				set((state) => ({
					panels: {
						...state.panels,
						...sizes,
					},
				})),
			resetPanels: () => set({ ...PANEL_CONFIG }),
		}),
		{
			name: "panel-sizes",
			version: 2,
			migrate: (persistedState) => {
				const state = isRecord(persistedState) ? persistedState : null;
				if (!state) return { panels: { ...PANEL_CONFIG.panels } };
				const readNumber = (key: string): number | undefined => {
					const value = state[key];
					return typeof value === "number" ? value : undefined;
				};

				if (isRecord(state.panels)) {
					const saved = state.panels;
					const savedNumber = (key: PanelId): number =>
						typeof saved[key] === "number"
							? saved[key]
							: PANEL_CONFIG.panels[key];
					return {
						panels: {
							tools: savedNumber("tools"),
							preview: savedNumber("preview"),
							properties: savedNumber("properties"),
							mainContent: savedNumber("mainContent"),
							timeline: savedNumber("timeline"),
						},
					};
				}

				return {
					panels: {
						tools:
							readNumber("tools") ??
							readNumber("toolsPanel") ??
							PANEL_CONFIG.panels.tools,
						preview:
							readNumber("preview") ??
							readNumber("previewPanel") ??
							PANEL_CONFIG.panels.preview,
						properties:
							readNumber("properties") ??
							readNumber("propertiesPanel") ??
							PANEL_CONFIG.panels.properties,
						mainContent:
							readNumber("mainContent") ?? PANEL_CONFIG.panels.mainContent,
						timeline: readNumber("timeline") ?? PANEL_CONFIG.panels.timeline,
					},
				};
			},
			partialize: (state) => ({
				panels: state.panels,
			}),
		},
	),
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
