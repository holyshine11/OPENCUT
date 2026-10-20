import type {
	AudioTrack,
	LegacySceneTracks,
	OverlayTrack,
	SceneTracks,
	VideoTrack,
} from "./types";

/**
 * 옛 형식(위쪽 트랙·메인·오디오)을 한 줄 목록으로 편다. 비어 있는 메인 트랙은 버린다.
 * 저장 데이터를 읽는 쪽이라 모양이 어긋난 값은 건너뛴다
 */
export function fromLegacySceneTracks({
	tracks,
}: {
	tracks: unknown;
}): SceneTracks {
	if (typeof tracks !== "object" || tracks === null) return [];
	const { overlay, main, audio } = tracks as Partial<LegacySceneTracks>;
	return [
		...(Array.isArray(overlay) ? overlay : []),
		...(main && Array.isArray(main.elements) && main.elements.length > 0
			? [main]
			: []),
		...(Array.isArray(audio) ? audio : []),
	];
}

/**
 * 한 줄 목록을 옛 형식으로 접는다. 옛 버전이 열 수 있게 저장할 때 함께 남긴다.
 * 맨 아래 영상 트랙을 메인으로 삼고, 없으면 빈 메인 트랙을 만든다
 */
export function toLegacySceneTracks({
	tracks,
	sceneId,
}: {
	tracks: SceneTracks;
	sceneId: string;
}): LegacySceneTracks {
	const main = tracks.findLast(
		(track): track is VideoTrack => track.type === "video",
	) ?? {
		id: `${sceneId}:main`,
		name: "Main Track",
		type: "video",
		elements: [],
		muted: false,
		hidden: false,
	};
	return {
		overlay: tracks.filter(
			(track): track is OverlayTrack =>
				track.type !== "audio" && track.id !== main.id,
		),
		main,
		audio: tracks.filter(
			(track): track is AudioTrack => track.type === "audio",
		),
	};
}
