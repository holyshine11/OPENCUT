"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	MagicWand05Icon,
	MusicNote03Icon,
	TextIcon,
} from "@hugeicons/core-free-icons";
import { OcShapesIcon, OcVideoIcon } from "@/components/icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { translateLabel, useMessages } from "@/i18n";
import type { TrackType } from "@/timeline";
import { DEFAULT_TRACK_NAMES } from "@/timeline/tracks";

export const TRACK_ICONS: Record<TrackType, ReactNode> = {
	video: <OcVideoIcon className="text-muted-foreground size-4 shrink-0" />,
	text: (
		<HugeiconsIcon
			icon={TextIcon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
	audio: (
		<HugeiconsIcon
			icon={MusicNote03Icon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
	graphic: <OcShapesIcon className="text-muted-foreground size-4 shrink-0" />,
	effect: (
		<HugeiconsIcon
			icon={MagicWand05Icon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
};

const ADDABLE_TRACK_TYPES: TrackType[] = [
	"video",
	"audio",
	"text",
	"graphic",
	"effect",
];

/** 종류를 골라 빈 트랙을 기본 자리에 만든다 */
export function AddTrackMenuContent() {
	const editor = useEditor();
	const m = useMessages();
	return (
		<DropdownMenuContent align="start">
			{ADDABLE_TRACK_TYPES.map((type) => (
				<DropdownMenuItem
					key={type}
					onSelect={() =>
						editor.timeline.addTrack({ type, keepWhenEmpty: true })
					}
				>
					{TRACK_ICONS[type]}
					{translateLabel({ messages: m, label: DEFAULT_TRACK_NAMES[type] })}
				</DropdownMenuItem>
			))}
		</DropdownMenuContent>
	);
}

/** 빈 영역을 더블 클릭한 자리에 띄우는 트랙 추가 메뉴 */
export function AddTrackMenuAtPoint({
	point,
	onClose,
}: {
	point: { x: number; y: number } | null;
	onClose: () => void;
}) {
	return (
		<DropdownMenu
			open={point !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DropdownMenuTrigger asChild>
				<span
					aria-hidden
					className="pointer-events-none fixed size-0"
					style={{ left: point?.x ?? 0, top: point?.y ?? 0 }}
				/>
			</DropdownMenuTrigger>
			<AddTrackMenuContent />
		</DropdownMenu>
	);
}
