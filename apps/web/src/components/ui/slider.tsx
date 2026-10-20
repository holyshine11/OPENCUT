"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/utils/ui";
import { isAppleDevice } from "@/utils/platform";

/** ⌘-click (Ctrl-click off Apple) on a slider snaps it back to its default value. */
export function isResetClick(event: React.PointerEvent): boolean {
	return event.button === 0 && (isAppleDevice() ? event.metaKey : event.ctrlKey);
}

/**
 * Composes `onReset` into a slider root's pointer-down. Preventing default
 * stops Radix from starting a drag, so the reset is the only change made.
 */
export function withResetClick({
	onReset,
	onPointerDown,
}: {
	onReset?: () => void;
	onPointerDown?: React.PointerEventHandler<HTMLSpanElement>;
}): React.PointerEventHandler<HTMLSpanElement> {
	return (event) => {
		if (onReset && isResetClick(event)) {
			event.preventDefault();
			event.stopPropagation();
			onReset();
			return;
		}
		onPointerDown?.(event);
	};
}

const Slider = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
		className?: string;
		/** Called on ⌘-click (Ctrl-click off Apple); should set and commit the default value. */
		onReset?: () => void;
	}
>(({ className, onReset, onPointerDown, ...props }, ref) => (
	<SliderPrimitive.Root
		ref={ref}
		onPointerDown={withResetClick({ onReset, onPointerDown })}
		className={cn(
			"relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
			className,
		)}
		{...props}
	>
		<SliderPrimitive.Track className="bg-accent relative h-1.5 w-full grow overflow-hidden rounded-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5">
			<SliderPrimitive.Range className="bg-primary absolute h-full data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full" />
		</SliderPrimitive.Track>
		<SliderPrimitive.Thumb className="border-primary/50 bg-background focus-visible:ring-ring block size-4 rounded-full border shadow-sm focus-visible:ring-1 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50" />
	</SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
