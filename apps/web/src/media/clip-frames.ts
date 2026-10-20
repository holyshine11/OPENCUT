import {
	Input,
	ALL_FORMATS,
	BlobSource,
	VideoSampleSink,
	type InputVideoTrack,
} from "mediabunny";
import { renderThumbnailDataUrl } from "./thumbnail";

const CLIP_FRAME_HEIGHT = 180;
// 180px JPEG 한 장이 10KB 안팎이라 수 MB에서 멈춘다
const MAX_CACHED_FRAMES = 300;

interface FrameSource {
	input: Input;
	track: InputVideoTrack;
	sink: VideoSampleSink;
	// 같은 sink에서 동시에 디코딩하지 않도록 요청을 한 줄로 세운다
	queue: Promise<unknown>;
}

const sources = new Map<string, Promise<FrameSource | null>>();
// Map 삽입 순서를 LRU 순서로 쓴다. 꺼낼 때마다 맨 뒤로 옮긴다
const frames = new Map<string, Promise<string | null>>();

/** 타임라인 클립이 시작하는 소스 시점(초)의 프레임. 같은 영상에서 자른 클립끼리 공유한다 */
export function getClipFrameThumbnail({
	mediaId,
	file,
	time,
}: {
	mediaId: string;
	file: File;
	time: number;
}): Promise<string | null> {
	const key = `${mediaId}:${time.toFixed(1)}`;
	let frame = frames.get(key);
	if (frame) {
		frames.delete(key);
	} else {
		frame = decodeFrame({ mediaId, file, time }).catch(() => null);
	}
	frames.set(key, frame);

	if (frames.size > MAX_CACHED_FRAMES) {
		const oldest = frames.keys().next().value;
		if (oldest !== undefined) frames.delete(oldest);
	}
	return frame;
}

export function clearClipFrames({ mediaId }: { mediaId: string }): void {
	for (const key of frames.keys()) {
		if (key.startsWith(`${mediaId}:`)) frames.delete(key);
	}
	const source = sources.get(mediaId);
	sources.delete(mediaId);
	void source?.then((s) => s?.input.dispose());
}

export function clearAllClipFrames(): void {
	for (const mediaId of sources.keys()) {
		clearClipFrames({ mediaId });
	}
	frames.clear();
}

function getSource({
	mediaId,
	file,
}: {
	mediaId: string;
	file: File;
}): Promise<FrameSource | null> {
	let source = sources.get(mediaId);
	if (!source) {
		source = openSource({ file }).catch(() => null);
		sources.set(mediaId, source);
	}
	return source;
}

async function openSource({ file }: { file: File }): Promise<FrameSource | null> {
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	const track = await input.getPrimaryVideoTrack();
	if (!track || !(await track.canDecode())) {
		input.dispose();
		return null;
	}
	return {
		input,
		track,
		sink: new VideoSampleSink(track),
		queue: Promise.resolve(),
	};
}

async function decodeFrame({
	mediaId,
	file,
	time,
}: {
	mediaId: string;
	file: File;
	time: number;
}): Promise<string | null> {
	const source = await getSource({ mediaId, file });
	if (!source) return null;

	const result = source.queue.then(async () => {
		const sample = await source.sink.getSample(time);
		if (!sample) return null;
		try {
			const scale = CLIP_FRAME_HEIGHT / source.track.displayHeight;
			return renderThumbnailDataUrl({
				width: Math.round(source.track.displayWidth * scale),
				height: CLIP_FRAME_HEIGHT,
				draw: ({ context, width, height }) => {
					sample.draw(context, 0, 0, width, height);
				},
			});
		} finally {
			sample.close();
		}
	});
	source.queue = result.catch(() => {});
	return result;
}
