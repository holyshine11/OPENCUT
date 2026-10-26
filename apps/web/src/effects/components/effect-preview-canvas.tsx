"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { ParamValues } from "@/params";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { cn } from "@/utils/ui";

const EMPTY_PARAMS: ParamValues = {};

export const EffectPreviewCanvas = memo(function EffectPreviewCanvas({
	effectType,
	params = EMPTY_PARAMS,
	className,
}: {
	effectType: string;
	params?: ParamValues;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// strips hold dozens of thumbnails; only the ones scrolled into view pay for a GPU render
	const [isVisible, setIsVisible] = useState(false);
	// presets pass a fresh object every render; only re-render the thumbnail when values change
	const paramsKey = JSON.stringify(params);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || isVisible) return;
		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "120px" },
		);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [isVisible]);

	useEffect(() => {
		if (!isVisible) return;
		const resolvedParams: ParamValues = JSON.parse(paramsKey);
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: resolvedParams,
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType, paramsKey, isVisible]);

	return <canvas ref={canvasRef} className={cn("size-full", className)} />;
});
