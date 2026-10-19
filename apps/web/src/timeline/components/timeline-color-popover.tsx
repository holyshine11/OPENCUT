"use client";

import { useState, type ComponentProps } from "react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import type { TimelineTrack } from "@/timeline";
import { cn } from "@/utils/ui";
import { getTrackColor, TIMELINE_COLOR_PALETTE } from "./theme";

interface ColorPaletteProps {
	/** 지금 보이는 색. 프리셋 강조와 사용자 지정 색의 시작값으로 쓴다 */
	color?: string;
	/** 직접 지정한 색이 있어 되돌릴 수 있는지 */
	canReset: boolean;
	resetLabel: string;
	/** undefined면 기본값으로 되돌린다 */
	onColorChange: (color: string | undefined) => void;
}

const toPickerHex = (color?: string) =>
	(color ?? TIMELINE_COLOR_PALETTE[0]).replace("#", "").toUpperCase();

// 팝오버 안 클릭이 React 트리를 타고 타임라인 끌기·선택 핸들러로 번지지 않게 막는다
const stopPropagation = (event: React.SyntheticEvent) =>
	event.stopPropagation();

function ColorPaletteContent({
	color,
	canReset,
	resetLabel,
	onColorChange,
	side,
	align,
}: ColorPaletteProps &
	Pick<ComponentProps<typeof PopoverContent>, "side" | "align">) {
	const m = useMessages();
	// 끄는 동안만 쓰는 임시 색. 확정하면 비워서 저장된 색을 다시 보여 준다
	const [draftHex, setDraftHex] = useState<string | null>(null);

	return (
		<PopoverContent
			className="flex w-56 flex-col gap-2 p-2"
			onMouseDown={stopPropagation}
			onClick={stopPropagation}
			onContextMenu={stopPropagation}
			side={side}
			align={align}
		>
			<div className="grid grid-cols-8 gap-1">
				{TIMELINE_COLOR_PALETTE.map((preset) => (
					<button
						key={preset}
						type="button"
						aria-label={preset}
						className={cn(
							"size-5 cursor-pointer rounded-sm border border-black/20 hover:ring-1 hover:ring-foreground/40",
							color?.toUpperCase() === preset && "ring-primary ring-2",
						)}
						style={{ backgroundColor: preset }}
						onClick={() => onColorChange(preset)}
					/>
				))}
			</div>
			<span className="text-muted-foreground text-xs">
				{m.timeline.customColor}
			</span>
			<ColorPicker
				value={draftHex ?? toPickerHex(color)}
				onChange={(hex) => setDraftHex(hex.toUpperCase())}
				onChangeEnd={(hex) => {
					setDraftHex(null);
					onColorChange(`#${hex.toUpperCase()}`);
				}}
				className="bg-background"
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={!canReset}
				onClick={() => onColorChange(undefined)}
			>
				{resetLabel}
			</Button>
		</PopoverContent>
	);
}

/** 트랙 머리 왼쪽 색 띠. 누르면 트랙 색 팔레트가 열린다 */
export function TrackColorStrip({ track }: { track: TimelineTrack }) {
	const m = useMessages();
	const editor = useEditor();
	const color = getTrackColor({ track });

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={m.timeline.trackColor}
					className="bg-muted absolute inset-y-0 left-0 w-1.5 cursor-pointer hover:brightness-125"
					style={color ? { backgroundColor: color } : undefined}
				/>
			</PopoverTrigger>
			<ColorPaletteContent
				side="right"
				align="start"
				color={color}
				canReset={track.color !== undefined}
				resetLabel={m.timeline.resetColor}
				onColorChange={(next) =>
					editor.timeline.setTrackColor({ trackId: track.id, color: next })
				}
			/>
		</Popover>
	);
}

/** 우클릭 메뉴에서 여는 팔레트. 감싼 요소 전체에 붙어 뜬다 */
export function AnchoredColorPopover({
	open,
	onOpenChange,
	...paletteProps
}: ColorPaletteProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverAnchor className="pointer-events-none absolute inset-0" />
			<ColorPaletteContent align="start" {...paletteProps} />
		</Popover>
	);
}
