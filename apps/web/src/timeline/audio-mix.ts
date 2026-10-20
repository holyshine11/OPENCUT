import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "./audio-constants";
import type { TimelineTrack } from "./types";

/** 트랙·마스터 페이더 dB를 선형 게인으로. 맨 아래(-60 dB)는 무음(-∞)으로 본다 */
export function faderDbToGain(db: number): number {
	if (!Number.isFinite(db)) return 1;
	if (db <= VOLUME_DB_MIN) return 0;
	return 10 ** (Math.min(VOLUME_DB_MAX, db) / 20);
}

/** 트랙 페이더(dB)를 선형 게인으로. 오디오가 없는 트랙은 1 */
export function getTrackGain(track: TimelineTrack): number {
	return "volume" in track ? faderDbToGain(track.volume ?? 0) : 1;
}

export function isTrackSoloed(track: TimelineTrack): boolean {
	return "solo" in track && track.solo === true;
}

/** 다른 트랙이 솔로라서 이 트랙이 빠지는지 */
export function isTrackSilencedBySolo({
	track,
	tracks,
}: {
	track: TimelineTrack;
	tracks: readonly TimelineTrack[];
}): boolean {
	return !isTrackSoloed(track) && tracks.some(isTrackSoloed);
}

/** 트랙 팬(-1 왼쪽 ~ 1 오른쪽) */
export function getTrackPan(track: TimelineTrack): number {
	if (!("pan" in track)) return 0;
	const pan = track.pan ?? 0;
	return Number.isFinite(pan) ? Math.min(1, Math.max(-1, pan)) : 0;
}

/**
 * StereoPannerNode와 같은 등전력 팬. 미리보기(Web Audio)와 내보내기 믹스가 같은 소리를 내도록
 * 사양서 공식을 그대로 옮겼다. 모노 소스는 r을 무시한다.
 */
export function panStereoSample({
	l,
	r,
	pan,
	isMono,
}: {
	l: number;
	r: number;
	pan: number;
	isMono: boolean;
}): [number, number] {
	if (pan === 0) return isMono ? [l, l] : [l, r];
	if (isMono) {
		const x = ((pan + 1) / 2) * (Math.PI / 2);
		return [l * Math.cos(x), l * Math.sin(x)];
	}
	if (pan <= 0) {
		const x = (pan + 1) * (Math.PI / 2);
		return [l + r * Math.cos(x), r * Math.sin(x)];
	}
	const x = pan * (Math.PI / 2);
	return [l * Math.cos(x), r + l * Math.sin(x)];
}

/** 진폭(0~)을 dBFS로. 무음은 -Infinity */
export function linearToDb(value: number): number {
	return value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY;
}
