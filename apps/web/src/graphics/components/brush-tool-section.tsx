"use client";

import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	ERASER_SIZE_PARAM,
	useBrushToolStore,
	type BrushTool,
} from "@/graphics/brush-tool-store";
import { useMessages } from "@/i18n";
import { useStickersStore } from "@/stickers/stickers-store";

const BRUSH_TOOLS: BrushTool[] = ["draw", "move", "erase"];

export function BrushToolSection() {
	const m = useMessages();
	const { tool, setTool, eraserSize, setEraserSize } = useBrushToolStore();
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
	const { selectedCategory, setSelectedCategory } = useStickersStore();

	const selectTool = (next: BrushTool) => {
		setTool(next);
		// 그리기·지우개는 프리뷰가 브러쉬 모드일 때만 동작하므로 브러쉬 탭을 연다
		if (next !== "move") {
			setActiveTab("stickers");
			if (selectedCategory !== "brush") setSelectedCategory({ category: "brush" });
		}
	};

	return (
		<Section sectionKey="brush-tool">
			<SectionHeader>
				<SectionTitle>{m.stickers.brushTool.title}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<ToggleGroup
						type="single"
						size="sm"
						variant="outline"
						className="justify-start"
						value={tool}
						onValueChange={(value) => {
							const next = BRUSH_TOOLS.find((option) => option === value);
							if (next) selectTool(next);
						}}
					>
						{BRUSH_TOOLS.map((option) => (
							<ToggleGroupItem key={option} value={option} className="flex-1 text-xs">
								{m.stickers.brushTool[option]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					{tool === "erase" && (
						<PropertyParamField
							param={ERASER_SIZE_PARAM}
							value={eraserSize}
							onPreview={(value) => setEraserSize(Number(value))}
							onCommit={() => {}}
						/>
					)}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
