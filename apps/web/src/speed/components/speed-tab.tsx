import { useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSpeed02Icon } from "@hugeicons/core-free-icons";
import { buildConstantRetime } from "@/retime";
import {
	DEFAULT_RETIME_RATE,
	MAX_RETIME_RATE,
	clampRetimeRate,
	canMaintainPitch,
} from "@/retime/rate";
import type { RetimableElement } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import { useMessages } from "@/i18n";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";

// 속도는 0.1 단위로 정한다. 슬라이더·입력·끌기 모두 같은 단위를 쓴다
const SPEED_STEP = 0.1;
const MIN_SPEED = SPEED_STEP;
const SPEED_FRACTION_DIGITS = getFractionDigitsForStep({ step: SPEED_STEP });

function rateToDisplay({ rate }: { rate: number }): string {
	return formatNumberForDisplay({
		value: rate,
		fractionDigits: SPEED_FRACTION_DIGITS,
	});
}

function parseSpeedInput({ input }: { input: string }): number | null {
	const parsed = parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return clampSpeed({ rate: parsed });
}

function clampSpeed({ rate }: { rate: number }): number {
	return clampRetimeRate({
		rate: Math.max(MIN_SPEED, snapToStep({ value: rate, step: SPEED_STEP })),
	});
}

export interface SpeedTarget {
	trackId: string;
	element: RetimableElement;
}

function buildRetime({
	rate,
	maintainPitch,
}: {
	rate: number;
	maintainPitch: boolean;
}) {
	if (rate === DEFAULT_RETIME_RATE && !maintainPitch) return undefined;
	return buildConstantRetime({ rate, maintainPitch });
}

/** 고른 클립들(targets)에만 같은 속도를 준다. 값은 첫 클립 것을 보여 준다 */
export function SpeedTab({ targets }: { targets: SpeedTarget[] }) {
	const editor = useEditor();
	const m = useMessages();
	const [first] = targets;
	const rate = clampRetimeRate({
		rate: first.element.retime?.rate ?? DEFAULT_RETIME_RATE,
	});
	const isPitchPreserveAvailable = canMaintainPitch({ rate });
	const maintainPitch = first.element.retime?.maintainPitch ?? false;
	const pendingRateRef = useRef(rate);
	// 미리보기는 패널 값에 반영되지 않아서, 끄는 동안의 슬라이더 값은 따로 든다
	const [slidingRate, setSlidingRate] = useState<number | null>(null);

	// 음높이 설정은 클립마다 제 것을 지키고, 스위치를 건드렸을 때만 모두 바꾼다
	const retimeOf = ({
		target,
		rate: nextRate,
		maintainPitch: nextMaintainPitch,
	}: {
		target: SpeedTarget;
		rate: number;
		maintainPitch?: boolean;
	}) =>
		buildRetime({
			rate: nextRate,
			maintainPitch:
				nextMaintainPitch ?? target.element.retime?.maintainPitch ?? false,
		});

	const commitRetime = ({
		rate: nextRate,
		maintainPitch: nextMaintainPitch,
	}: {
		rate: number;
		maintainPitch?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: targets.map((target) => ({
				trackId: target.trackId,
				elementId: target.element.id,
				patch: {
					retime: retimeOf({
						target,
						rate: nextRate,
						maintainPitch: nextMaintainPitch,
					}),
				},
			})),
		});
	};

	const previewRate = (nextRate: number) => {
		pendingRateRef.current = nextRate;
		editor.timeline.previewElements({
			updates: targets.map((target) => ({
				trackId: target.trackId,
				elementId: target.element.id,
				updates: { retime: retimeOf({ target, rate: nextRate }) },
			})),
		});
	};

	const speedDraft = usePropertyDraft({
		displayValue: rateToDisplay({ rate }),
		parse: (input) => parseSpeedInput({ input }),
		onPreview: previewRate,
		onCommit: () => {
			commitRetime({ rate: pendingRateRef.current });
		},
	});

	return (
		<Section collapsible sectionKey={`${first.element.id}:speed`}>
			<SectionHeader>
				<SectionTitle>
					{targets.length > 1
						? m.properties.speedForClips({ count: targets.length })
						: m.properties.speed}
				</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField label={m.properties.speed}>
						<NumberField
							icon={<HugeiconsIcon icon={DashboardSpeed02Icon} />}
							value={
								slidingRate === null
									? speedDraft.displayValue
									: rateToDisplay({ rate: slidingRate })
							}
							suffix="x"
							scrubRanges={[
								{ from: MIN_SPEED, to: 1, pixelsPerUnit: 160 },
								{ from: 1, to: MAX_RETIME_RATE, pixelsPerUnit: 48 },
							]}
							scrubClamp={{ min: MIN_SPEED, max: MAX_RETIME_RATE }}
							onFocus={() => {
								pendingRateRef.current = rate;
								speedDraft.onFocus();
							}}
							onChange={speedDraft.onChange}
							onBlur={speedDraft.onBlur}
							onScrub={speedDraft.scrubTo}
							onScrubEnd={speedDraft.commitScrub}
							onReset={() => commitRetime({ rate: DEFAULT_RETIME_RATE })}
							isDefault={rate === DEFAULT_RETIME_RATE}
						/>
						<Slider
							aria-label={m.properties.speed}
							className="mt-2"
							min={MIN_SPEED}
							max={MAX_RETIME_RATE}
							step={SPEED_STEP}
							value={[slidingRate ?? rate]}
							onValueChange={([value]) => {
								const nextRate = clampSpeed({ rate: value });
								setSlidingRate(nextRate);
								previewRate(nextRate);
							}}
							onReset={() => commitRetime({ rate: DEFAULT_RETIME_RATE })}
							onValueCommit={([value]) => {
								setSlidingRate(null);
								commitRetime({ rate: clampSpeed({ rate: value }) });
							}}
						/>
					</SectionField>
					<div className="flex items-center justify-between">
						<span className="text-sm">{m.properties.changePitch}</span>
						<Switch
							checked={!maintainPitch}
							disabled={!isPitchPreserveAvailable}
							onCheckedChange={(checked) =>
								commitRetime({ rate, maintainPitch: !checked })
							}
						/>
					</div>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
