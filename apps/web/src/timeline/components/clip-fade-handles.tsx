"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import {
	applyFadeCurve,
	CROSSFADE_CURVE,
	type CrossfadeExtent,
	type FadeCurveId,
} from "@/timeline/audio-fade";
import {
	type AudioCapableElement,
	getElementFades,
} from "@/timeline/audio-state";
import { formatNumberForDisplay, snapToStep } from "@/utils/math";
import { cn } from "@/utils/ui";
import { TICKS_PER_SECOND } from "@/wasm";

const HANDLE_SIZE_PX = 8;
const FADE_STEP_SECONDS = 0.01;
const CURVE_SEGMENTS = 24;

type FadeSide = "fadeIn" | "fadeOut";

/** 큐베이스처럼 클립 위쪽 양 끝에서 끌어 페이드 인·아웃 길이를 정한다 */
export function ClipFadeHandles({
	element,
	trackId,
	pixelsPerSecond,
	isSelected,
	crossfade,
}: {
	element: AudioCapableElement;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
	/** 맞붙은 클립과의 크로스페이드. 그쪽 페이드는 크로스페이드가 대신한다 */
	crossfade?: CrossfadeExtent;
}) {
	const { fadeIn, fadeOut, fadeInCurve, fadeOutCurve } = getElementFades({
		element,
	});
	const hasCrossfadeIn = (crossfade?.fadeIn ?? 0) > 0;
	const hasCrossfadeOut = (crossfade?.fadeOut ?? 0) > 0;
	const inWidth = fadeIn * pixelsPerSecond;
	const outWidth = fadeOut * pixelsPerSecond;

	return (
		<div className="pointer-events-none absolute inset-0">
			<div className="absolute inset-0 overflow-hidden rounded-sm">
				{hasCrossfadeIn && crossfade ? (
					<FadeShape
						side="fadeIn"
						curve={CROSSFADE_CURVE}
						width={crossfade.fadeIn * pixelsPerSecond}
						// 경계 앞쪽(이전 클립 자리)으로 늘린 부분은 잘려 보이지 않는다
						offset={-crossfade.before * pixelsPerSecond}
						isCrossfade
					/>
				) : (
					inWidth > 0 && (
						<FadeShape side="fadeIn" curve={fadeInCurve} width={inWidth} />
					)
				)}
				{hasCrossfadeOut && crossfade ? (
					<FadeShape
						side="fadeOut"
						curve={CROSSFADE_CURVE}
						width={crossfade.fadeOut * pixelsPerSecond}
						offset={-crossfade.after * pixelsPerSecond}
						isCrossfade
					/>
				) : (
					outWidth > 0 && (
						<FadeShape side="fadeOut" curve={fadeOutCurve} width={outWidth} />
					)
				)}
			</div>
			{isSelected && !hasCrossfadeIn && (
				<FadeHandle
					side="fadeIn"
					element={element}
					trackId={trackId}
					pixelsPerSecond={pixelsPerSecond}
					offsetPx={inWidth}
				/>
			)}
			{isSelected && !hasCrossfadeOut && (
				<FadeHandle
					side="fadeOut"
					element={element}
					trackId={trackId}
					pixelsPerSecond={pixelsPerSecond}
					offsetPx={outWidth}
				/>
			)}
		</div>
	);
}

/** 페이드 구간을 어둡게 덮고 게인 곡선을 그린다. offset만큼 클립 바깥으로 밀 수 있다 */
function FadeShape({
	side,
	curve,
	width,
	offset = 0,
	isCrossfade = false,
}: {
	side: FadeSide;
	curve: FadeCurveId;
	width: number;
	offset?: number;
	isCrossfade?: boolean;
}) {
	const points = Array.from({ length: CURVE_SEGMENTS + 1 }, (_, i) => {
		const progress = i / CURVE_SEGMENTS;
		const x = side === "fadeIn" ? progress * 100 : (1 - progress) * 100;
		return `${x},${(1 - applyFadeCurve({ curve, progress })) * 100}`;
	}).join(" ");
	const corner = side === "fadeIn" ? "0,0" : "100,0";
	return (
		<svg
			className="absolute top-0 h-full"
			style={
				side === "fadeIn"
					? { left: offset, width }
					: { right: offset, width }
			}
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden
		>
			<polygon points={`${corner} ${points}`} className="fill-black/35" />
			<polyline
				points={points}
				className={cn(
					"fill-none",
					isCrossfade ? "stroke-amber-300" : "stroke-white/90",
				)}
				strokeWidth={1}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function FadeHandle({
	side,
	element,
	trackId,
	pixelsPerSecond,
	offsetPx,
}: {
	side: FadeSide;
	element: AudioCapableElement;
	trackId: string;
	pixelsPerSecond: number;
	offsetPx: number;
}) {
	const m = useMessages();
	const editor = useEditor();
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startValue: number;
		maxValue: number;
		changed: boolean;
	} | null>(null);
	const [dragValue, setDragValue] = useState<number | null>(null);

	const finish = ({ shouldCommit }: { shouldCommit: boolean }) => {
		const drag = dragRef.current;
		dragRef.current = null;
		setDragValue(null);
		if (shouldCommit && drag?.changed) {
			editor.timeline.commitPreview();
		} else {
			editor.timeline.discardPreview();
		}
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const fades = getElementFades({ element });
		const other = side === "fadeIn" ? fades.fadeOut : fades.fadeIn;
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startValue: fades[side],
			maxValue: Math.max(0, element.duration / TICKS_PER_SECOND - other),
			changed: false,
		};
		setDragValue(fades[side]);
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent) => {
		const drag = dragRef.current;
		if (drag?.pointerId !== event.pointerId) return;
		event.preventDefault();
		const deltaSeconds = (event.clientX - drag.startX) / pixelsPerSecond;
		const raw =
			drag.startValue + (side === "fadeIn" ? deltaSeconds : -deltaSeconds);
		const next = Math.min(
			drag.maxValue,
			Math.max(0, snapToStep({ value: raw, step: FADE_STEP_SECONDS })),
		);
		drag.changed = next !== drag.startValue;
		setDragValue(next);
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { params: { ...element.params, [side]: next } },
				},
			],
		});
	};

	const handlePointerUp = (event: React.PointerEvent) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		event.stopPropagation();
		finish({ shouldCommit: true });
	};

	const isIn = side === "fadeIn";
	const position = Math.max(0, offsetPx - HANDLE_SIZE_PX / 2);
	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 볼륨 선처럼 포인터로만 끄는 핸들. 키보드 조정은 속성 패널의 페이드 탭이 맡는다
		<div
			className="pointer-events-auto absolute top-0 touch-none cursor-ew-resize rounded-[2px] border border-black/40 bg-white shadow-sm"
			style={{
				width: HANDLE_SIZE_PX,
				height: HANDLE_SIZE_PX,
				...(isIn ? { left: position } : { right: position }),
			}}
			title={isIn ? m.timeline.dragFadeIn : m.timeline.dragFadeOut}
			onClick={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={() => finish({ shouldCommit: false })}
			onLostPointerCapture={() => {
				if (dragRef.current) finish({ shouldCommit: dragRef.current.changed });
			}}
		>
			{dragValue !== null && (
				<span
					className={cn(
						"absolute top-full mt-0.5 whitespace-nowrap rounded bg-black/80 px-1 text-[0.6rem] leading-tight text-white",
						isIn ? "left-0" : "right-0",
					)}
				>
					{formatNumberForDisplay({ value: dragValue, fractionDigits: 2 })}s
				</span>
			)}
		</div>
	);
}
