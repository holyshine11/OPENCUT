"use client";

import { useState } from "react";
import type {
	ParamDefinition,
	NumberParamDefinition,
	ParamValue,
} from "@/params";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { SectionField } from "@/components/section";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { usePropertyDraft } from "../hooks/use-property-draft";
import { KeyframeToggle } from "./keyframe-toggle";
import { Textarea } from "@/components/ui/textarea";
import { FontPicker } from "@/components/ui/font-picker";
import { translateLabel, useMessages } from "@/i18n";

export function PropertyParamField({
	param,
	value,
	onPreview,
	onCommit,
	keyframe,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
	keyframe?: {
		isActive: boolean;
		isDisabled: boolean;
		onToggle: () => void;
	};
}) {
	const m = useMessages();
	const label = translateLabel({ messages: m, label: param.label });
	return (
		<SectionField
			label={label}
			beforeLabel={
				keyframe && param.keyframable !== false ? (
					<KeyframeToggle
						isActive={keyframe.isActive}
						isDisabled={keyframe.isDisabled}
						title={m.properties.toggleKeyframe({ name: label })}
						onToggle={keyframe.onToggle}
					/>
				) : undefined
			}
		>
			<ParamInput
				param={param}
				value={value}
				onPreview={onPreview}
				onCommit={onCommit}
			/>
		</SectionField>
	);
}

function ParamInput({
	param,
	value,
	onPreview,
	onCommit,
}: {
	param: ParamDefinition;
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
}) {
	const m = useMessages();
	if (param.type === "number") {
		return (
			<NumberParamField
				param={param}
				value={typeof value === "number" ? value : Number(value)}
				onPreview={onPreview}
				onCommit={onCommit}
			/>
		);
	}

	if (param.type === "boolean") {
		return (
			<Switch
				checked={Boolean(value)}
				onCheckedChange={(checked) => {
					onPreview(checked);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "select") {
		return (
			<Select
				value={String(value)}
				onValueChange={(selected) => {
					onPreview(selected);
					onCommit();
				}}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{param.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{translateLabel({ messages: m, label: option.label })}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (param.type === "color") {
		return (
			<ColorPicker
				value={String(value).replace(/^#/, "").toUpperCase()}
				onChange={(color) => onPreview(`#${color}`)}
				onChangeEnd={(color) => {
					onPreview(`#${color}`);
					onCommit();
				}}
			/>
		);
	}

	if (param.type === "text") {
		return (
			<TextParamField
				value={String(value)}
				onPreview={onPreview}
				onCommit={onCommit}
			/>
		);
	}

	if (param.type === "font") {
		return (
			<FontPicker
				defaultValue={String(value)}
				onValueChange={(family) => {
					onPreview(family);
					onCommit();
				}}
			/>
		);
	}

	return null;
}

// 입력 중 미리보기는 속성 패널 값에 반영되지 않으므로 초안을 따로 들고 있다
function TextParamField({
	value,
	onPreview,
	onCommit,
}: {
	value: string;
	onPreview: (value: string) => void;
	onCommit: () => void;
}) {
	const draft = usePropertyDraft({
		displayValue: value,
		parse: (input) => input,
		onPreview,
		onCommit,
		supportsExpressions: false,
	});
	return (
		<Textarea
			value={draft.displayValue}
			onFocus={draft.onFocus}
			onChange={draft.onChange}
			onBlur={draft.onBlur}
		/>
	);
}

// 범위가 좁은 값(불투명도 0~1)은 이만큼 끌면 처음부터 끝까지 간다. 넓은 값은 원래 속도(1단위에 2px)를 지킨다
const FULL_RANGE_SCRUB_PX = 200;
const SLOW_SCRUB_PIXELS_PER_UNIT = 2;

function NumberParamField({
	param,
	value,
	onPreview,
	onCommit,
}: {
	param: NumberParamDefinition;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const m = useMessages();
	// 미리보기는 value에 바로 돌아오지 않아서, 끄는 동안 슬라이더·숫자 칸은 이 값을 보여 준다
	const [slidingValue, setSlidingValue] = useState<number | null>(null);
	const { min, max, step, displayMultiplier = 1 } = param;
	const displayValue = value * displayMultiplier;
	const clampDisplayValue = (nextDisplayValue: number) =>
		Math.max(
			min,
			max !== undefined ? Math.min(max, nextDisplayValue) : nextDisplayValue,
		);

	const previewFromDisplay = (displayVal: number) => {
		const clamped = clampDisplayValue(snapToStep({ value: displayVal, step }));
		onPreview(clamped / displayMultiplier);
	};

	const maxFractionDigits = getFractionDigitsForStep({ step });

	const draft = usePropertyDraft({
		displayValue: formatNumberForDisplay({
			value: slidingValue ?? displayValue,
			maxFractionDigits,
		}),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return clampDisplayValue(snapToStep({ value: parsed, step }));
		},
		onPreview: previewFromDisplay,
		onCommit,
	});

	const handleReset = () => {
		onPreview(param.default);
		onCommit();
	};

	const field = (
		<NumberField
			icon={param.shortLabel}
			suffix={param.suffix}
			value={draft.displayValue}
			dragSensitivity="slow"
			scrubRanges={
				max === undefined
					? undefined
					: [
							{
								from: min,
								to: max,
								pixelsPerUnit: Math.max(
									SLOW_SCRUB_PIXELS_PER_UNIT,
									FULL_RANGE_SCRUB_PX / (max - min),
								),
							},
						]
			}
			scrubClamp={{ min, max }}
			isDefault={value === param.default}
			onFocus={draft.onFocus}
			onChange={draft.onChange}
			onBlur={draft.onBlur}
			onScrub={previewFromDisplay}
			onScrubEnd={onCommit}
			onReset={handleReset}
		/>
	);
	if (!param.slider || max === undefined) return field;

	return (
		<>
			{field}
			<Slider
				aria-label={translateLabel({ messages: m, label: param.label })}
				className="mt-2"
				min={min}
				max={max}
				step={step}
				value={[slidingValue ?? clampDisplayValue(displayValue)]}
				onValueChange={([next]) => {
					setSlidingValue(next);
					previewFromDisplay(next);
				}}
				onValueCommit={() => {
					setSlidingValue(null);
					onCommit();
				}}
				onReset={handleReset}
			/>
		</>
	);
}
