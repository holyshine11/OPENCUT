"use client";

import { useMessages } from "@/i18n";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

function Spinner({ className, ...props }: Omit<HugeiconsIconProps, "icon">) {
	const m = useMessages();
	return (
		<HugeiconsIcon
			icon={Loading03Icon}
			role="status"
			aria-label={m.ui.loading}
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
