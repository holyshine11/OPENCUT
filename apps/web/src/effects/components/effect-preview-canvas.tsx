"use client";

import { useEffect, useRef } from "react";
import type { ParamValues } from "@/params";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { cn } from "@/utils/ui";

const EMPTY_PARAMS: ParamValues = {};

export function EffectPreviewCanvas({
	effectType,
	params = EMPTY_PARAMS,
	className,
}: {
	effectType: string;
	params?: ParamValues;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	// presets pass a fresh object every render; only re-render the thumbnail when values change
	const paramsKey = JSON.stringify(params);

	useEffect(() => {
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
	}, [effectType, paramsKey]);

	return <canvas ref={canvasRef} className={cn("size-full", className)} />;
}
