"use client";

import type { TActionWithOptionalArgs } from "@/actions";
import { useShortcutLabel } from "@/actions/use-keyboard-shortcuts-help";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

// 아이콘 버튼 툴팁. action을 주면 현재 키바인딩의 단축키를 설명 옆에 붙인다
export function ActionTooltip({
	label,
	action,
	children,
}: {
	label: string;
	action?: TActionWithOptionalArgs;
	children: React.ReactElement;
}) {
	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>
				<span className="flex items-center gap-3">
					{label}
					{action && <ShortcutHint action={action} />}
				</span>
			</TooltipContent>
		</Tooltip>
	);
}

// 툴팁이 열릴 때만 그려지므로 서버 렌더에서 플랫폼 판별을 하지 않는다
function ShortcutHint({ action }: { action: TActionWithOptionalArgs }) {
	const shortcut = useShortcutLabel({ action });
	if (!shortcut) return null;
	return (
		<kbd className="text-muted-foreground font-sans text-xs">{shortcut}</kbd>
	);
}
