import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { SectionField } from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	RECOMMENDED_CAPTION_LAYOUTS,
	useCaptionLayouts,
	type CaptionForm,
} from "@/transcription/caption-layout-store";
import type { CaptionLayout } from "@/transcription/types";

type NumericKey = Exclude<keyof CaptionLayout, "stripPunctuation">;

const NUMBER_FIELDS: { key: NumericKey; label: string; integer: boolean }[] = [
	{ key: "maxCharsPerLine", label: "Characters per line", integer: true },
	{ key: "maxLines", label: "Lines per caption", integer: true },
	{ key: "minDuration", label: "Min seconds", integer: false },
	{ key: "maxDuration", label: "Max seconds", integer: false },
];

/** 자동 자막 줄 나누기 기준. 지금 프로젝트 비율(숏폼/롱폼)의 값을 고친다 */
export function CaptionLayoutFields({
	form,
	disabled,
}: {
	form: CaptionForm;
	disabled: boolean;
}) {
	const layout = useCaptionLayouts((state) => state.layouts[form]);
	const setLayout = useCaptionLayouts((state) => state.setLayout);
	const update = (patch: Partial<CaptionLayout>) =>
		setLayout({ form, layout: { ...layout, ...patch } });

	return (
		<SectionField label="Caption lines">
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">
					{form === "shortForm"
						? "Vertical project: short, one-line captions read best. Recommended values:"
						: "Horizontal project: up to two longer lines read best. Recommended values:"}
				</p>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() => update(RECOMMENDED_CAPTION_LAYOUTS.shortForm)}
					>
						Short-form
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() => update(RECOMMENDED_CAPTION_LAYOUTS.longForm)}
					>
						Long-form
					</Button>
				</div>
				<div className="grid grid-cols-2 gap-2">
					{NUMBER_FIELDS.map((field) => (
						<LayoutNumberField
							key={field.key}
							label={field.label}
							value={layout[field.key]}
							integer={field.integer}
							disabled={disabled}
							onCommit={(value) => update({ [field.key]: value })}
						/>
					))}
				</div>
				<div className="flex items-center justify-between text-xs">
					<label htmlFor="caption-strip-punctuation">Remove periods and commas</label>
					<Switch
						id="caption-strip-punctuation"
						checked={layout.stripPunctuation}
						disabled={disabled}
						onCheckedChange={(checked) => update({ stripPunctuation: checked })}
					/>
				</div>
			</div>
		</SectionField>
	);
}

function LayoutNumberField({
	label,
	value,
	integer,
	disabled,
	onCommit,
}: {
	label: string;
	value: number;
	integer: boolean;
	disabled: boolean;
	onCommit: (value: number) => void;
}) {
	const draft = usePropertyDraft({
		displayValue: String(value),
		supportsExpressions: false,
		parse: (input) => {
			const parsed = integer ? Number.parseInt(input, 10) : Number.parseFloat(input);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
		},
		onPreview: onCommit,
		onCommit: () => {},
	});

	return (
		<label className="flex flex-col gap-1 text-xs">
			{label}
			<NumberField
				value={draft.displayValue}
				aria-label={label}
				disabled={disabled}
				onFocus={draft.onFocus}
				onChange={draft.onChange}
				onBlur={draft.onBlur}
			/>
		</label>
	);
}
