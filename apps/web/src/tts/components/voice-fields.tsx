"use client";

// 대본 읽기 탭(에셋 패널)과 문장 다시 만들기 탭(속성 패널)이 같이 쓰는 서버 상태와 목소리 설정 칸
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SectionField } from "@/components/section";
import { useMessages } from "@/i18n";
import settings from "@/tts/settings.json";
import {
	fetchTtsServer,
	type TtsConfig,
	type TtsPreset,
	type TtsVoice,
} from "@/tts/client";
import type { TtsVoiceSettings } from "@/tts/insert";

export type TtsServerState =
	| { status: "loading" }
	| { status: "ready"; voices: TtsVoice[]; config: TtsConfig }
	| { status: "offline"; error: string };

export type ReadyTtsServer = Extract<TtsServerState, { status: "ready" }>;

export interface TtsVoiceForm {
	voice: string;
	style: string;
	/** 고른 프리셋 이름. 값을 손으로 바꾸면 비운다 */
	preset: string | null;
	strength: number;
	expressiveness: number;
	speed: number;
	pause: number;
}

type LevelKey = "strength" | "expressiveness" | "speed" | "pause";

// 두 탭이 서버를 한 번만 부르도록 패널 밖에 둔다
export const useTtsServer = create<{ server: TtsServerState }>()(() => ({
	server: { status: "loading" },
}));

export async function loadTtsServer(): Promise<void> {
	useTtsServer.setState({ server: { status: "loading" } });
	try {
		const { voices, config } = await fetchTtsServer();
		useTtsServer.setState({ server: { status: "ready", voices, config } });
	} catch (error) {
		useTtsServer.setState({
			server: {
				status: "offline",
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

/** 목소리에 없는 말투면 그 목소리의 첫 말투(기본)로 바꾼다 */
export function styleFor({
	voice,
	style,
}: {
	voice: TtsVoice | undefined;
	style: string;
}): string {
	if (!voice) return style;
	return voice.styles.some((item) => item.id === style)
		? style
		: (voice.styles[0]?.id ?? style);
}

export function defaultLevels({ config }: { config: TtsConfig }): Record<LevelKey, number> {
	const first = config.presets[0];
	return {
		strength: first?.strength ?? settings.fallbackLevels.strength,
		expressiveness: first?.expressiveness ?? settings.fallbackLevels.expressiveness,
		speed: config.speed,
		pause: config.pause,
	};
}

export function applyPreset<T extends TtsVoiceForm>({
	form,
	preset,
	voices,
}: {
	form: T;
	preset: TtsPreset;
	voices: TtsVoice[];
}): T {
	return {
		...form,
		preset: preset.name,
		style: styleFor({
			voice: voices.find((voice) => voice.name === form.voice),
			style: preset.style,
		}),
		strength: preset.strength,
		expressiveness: preset.expressiveness,
		speed: preset.speed,
		pause: preset.pause,
	};
}

export function toVoiceSettings({
	form,
	server,
}: {
	form: TtsVoiceForm;
	server: ReadyTtsServer;
}): { voiceSettings: TtsVoiceSettings; model: string } {
	return {
		voiceSettings: {
			voice: form.voice,
			style: form.style,
			speed: form.speed,
			pause: form.pause,
			question: server.config.question,
			strength: form.strength,
			expressiveness: form.expressiveness,
		},
		model: server.voices.find((voice) => voice.name === form.voice)?.model ?? "",
	};
}

/** 연결 중이거나 서버가 꺼졌을 때의 안내. 준비되면 아무것도 그리지 않는다 */
export function TtsServerNotice({ server }: { server: TtsServerState }) {
	const m = useMessages();
	if (server.status === "loading") {
		return (
			<div className="text-muted-foreground flex items-center gap-2 text-sm">
				<Spinner />
				{m.tts.connecting}
			</div>
		);
	}
	if (server.status === "offline") {
		return (
			<div className="bg-destructive/10 border-destructive/20 flex flex-col gap-2 rounded-md border p-3">
				<p className="text-destructive text-sm font-medium">{m.tts.offlineTitle}</p>
				<p className="text-destructive text-xs">{server.error}</p>
				<p className="text-muted-foreground text-xs">{m.tts.offlineHint}</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => void loadTtsServer()}
				>
					{m.tts.retry}
				</Button>
			</div>
		);
	}
	return null;
}

/** 목소리·프리셋·말투·감정 강도·표현력·속도(·문장 사이 쉼) 칸 */
export function TtsVoiceFields<T extends TtsVoiceForm>({
	form,
	onChange,
	server,
	disabled,
	showPause,
}: {
	form: T;
	onChange: (next: T) => void;
	server: ReadyTtsServer;
	disabled: boolean;
	showPause: boolean;
}) {
	const m = useMessages();
	const voice = server.voices.find((item) => item.name === form.voice);
	const update = (patch: Partial<TtsVoiceForm>) => onChange({ ...form, ...patch });
	const level = ({
		label,
		field,
		min,
		max,
		step,
		format,
	}: {
		label: string;
		field: LevelKey;
		min: number;
		max: number;
		step: number;
		format?: (value: number) => string;
	}) => (
		<LevelSlider
			label={label}
			value={form[field]}
			min={min}
			max={max}
			step={step}
			format={format}
			disabled={disabled}
			onChange={(value) => update({ [field]: value, preset: null })}
			onReset={() =>
				update({ [field]: defaultLevels({ config: server.config })[field], preset: null })
			}
		/>
	);

	return (
		<>
			<SectionField label={m.tts.voice}>
				<Select
					value={form.voice}
					disabled={disabled}
					onValueChange={(value) =>
						update({
							voice: value,
							style: styleFor({
								voice: server.voices.find((item) => item.name === value),
								style: form.style,
							}),
						})
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{server.voices.map((item) => (
							<SelectItem key={item.name} value={item.name}>
								{item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SectionField>
			<SectionField label={m.tts.preset}>
				<Select
					value={form.preset ?? ""}
					disabled={disabled}
					onValueChange={(value) => {
						const preset = server.config.presets.find((item) => item.name === value);
						if (preset) onChange(applyPreset({ form, preset, voices: server.voices }));
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder={m.tts.customPreset} />
					</SelectTrigger>
					<SelectContent>
						{server.config.presets.map((item) => (
							<SelectItem key={item.name} value={item.name}>
								{item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SectionField>
			<SectionField label={m.tts.style}>
				<Select
					value={form.style}
					disabled={disabled}
					onValueChange={(value) => update({ style: value, preset: null })}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(voice?.styles ?? []).map((item) => (
							<SelectItem key={item.id} value={item.id}>
								{item.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SectionField>
			{level({
				label: m.tts.strength,
				field: "strength",
				min: settings.level.min,
				max: settings.level.max,
				step: settings.level.step,
			})}
			{level({
				label: m.tts.expressiveness,
				field: "expressiveness",
				min: settings.level.min,
				max: settings.level.max,
				step: settings.level.step,
			})}
			{level({
				label: m.tts.speed,
				field: "speed",
				min: server.config.speed_min,
				max: server.config.speed_max,
				step: server.config.speed_step,
				format: (value) => `${value.toFixed(2)}×`,
			})}
			{showPause &&
				level({
					label: m.tts.pause,
					field: "pause",
					min: server.config.pause_min,
					max: server.config.pause_max,
					step: server.config.pause_step,
					format: (value) => m.tts.seconds({ value: value.toFixed(2) }),
				})}
		</>
	);
}

/** ⌘-click하면 서버 /config 기본값(감정 강도·표현력은 첫 프리셋 값)으로 돌아간다 */
function LevelSlider({
	label,
	value,
	min,
	max,
	step,
	format = String,
	disabled,
	onChange,
	onReset,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	format?: (value: number) => string;
	disabled: boolean;
	onChange: (value: number) => void;
	onReset: () => void;
}) {
	return (
		<SectionField label={label}>
			<div className="flex items-center gap-3">
				<Slider
					aria-label={label}
					min={min}
					max={max}
					step={step}
					value={[value]}
					disabled={disabled}
					onValueChange={([next]) => onChange(next)}
					onReset={onReset}
				/>
				<span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
					{format(value)}
				</span>
			</div>
		</SectionField>
	);
}
