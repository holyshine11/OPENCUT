// 대본 읽기 합성 서버(apps/tts/tts-web.py)와 주고받는 값. 브라우저는 /api/tts 라우트를 거친다.
// 목소리·말투·프리셋·슬라이더 범위는 전부 서버가 준다. 목소리를 새로 학습해도 여기를 고치지 않는다
import settings from "@/tts/settings.json";

const TTS_API_PATH = "/api/tts";

export interface TtsVoice {
	name: string;
	styles: { id: string; name: string }[];
	/** 목소리 모델 이름. 예전 서버는 주지 않는다 */
	model?: string;
}

export interface TtsPreset {
	name: string;
	style: string;
	strength: number;
	expressiveness: number;
	speed: number;
	pause: number;
}

export interface TtsConfig {
	speed: number;
	speed_min: number;
	speed_max: number;
	speed_step: number;
	pause: number;
	pause_min: number;
	pause_max: number;
	pause_step: number;
	/** 물음표를 바꿔 읽을 끝음 */
	question: string;
	/** 첫 항목이 처음 화면 값이다 */
	presets: TtsPreset[];
	max_chars: number;
	max_takes: number;
	formats: string[];
}

export interface TtsSynthRequest {
	text: string;
	voice: string;
	style: string;
	speed: number;
	/** 서버에서는 한 문장 안 조각 사이 쉼이다. 문장 사이는 타임라인 간격으로 둔다 */
	pause: number;
	question: string;
	strength: number;
	expressiveness: number;
}

/** 서버가 준 오류 문구를 그대로 담는다. status 503은 서버가 꺼졌거나 주소가 없다는 뜻이다 */
export class TtsError extends Error {
	constructor({ message, status }: { message: string; status: number }) {
		super(message);
		this.status = status;
	}

	status: number;
}

async function errorOf({ response }: { response: Response }): Promise<TtsError> {
	const body: unknown = await response.json().catch(() => null);
	const message =
		body && typeof body === "object" && "error" in body && typeof body.error === "string"
			? body.error
			: `${response.status} ${response.statusText}`;
	return new TtsError({ message, status: response.status });
}

async function getJson<T>({ path }: { path: string }): Promise<T> {
	const response = await fetch(`${TTS_API_PATH}/${path}`, { cache: "no-store" });
	if (!response.ok) throw await errorOf({ response });
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 서버 계약(tts-web.py)이 정한 모양이다
	return (await response.json()) as T;
}

export async function fetchTtsServer(): Promise<{ voices: TtsVoice[]; config: TtsConfig }> {
	const [voices, config] = await Promise.all([
		getJson<TtsVoice[]>({ path: "voices" }),
		getJson<TtsConfig>({ path: "config" }),
	]);
	return { voices, config };
}

/** 문장 하나를 합성해 오디오(WAV)를 받는다 */
export async function synthesize({
	request,
	signal,
}: {
	request: TtsSynthRequest;
	signal: AbortSignal;
}): Promise<Blob> {
	const response = await fetch(`${TTS_API_PATH}/synth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, format: settings.format }),
		signal,
	});
	if (!response.ok) throw await errorOf({ response });
	return response.blob();
}
