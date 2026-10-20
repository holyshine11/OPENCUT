import type { ElementAnimations } from "@/animation/types";
import type { Effect } from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";

export type ElementRef = {
	trackId: string;
	elementId: string;
};

export interface Bookmark {
	time: MediaTime;
	note?: string;
	color?: string;
	duration?: MediaTime;
}

export interface TScene {
	id: string;
	name: string;
	isMain: boolean;
	tracks: SceneTracks;
	bookmarks: Bookmark[];
	/** 트랙 폴더. 구성원은 트랙의 folderId로 가리킨다 */
	trackFolders?: TrackFolder[];
	createdAt: Date;
	updatedAt: Date;
}

export interface TrackFolder {
	id: string;
	name: string;
	color?: string;
	/** 접으면 안의 트랙 줄만 감춘다. 미리보기·내보내기에는 영향이 없다 */
	collapsed?: boolean;
}

export type TrackType = "video" | "text" | "audio" | "graphic" | "effect";

interface BaseTrack {
	id: string;
	name: string;
	/** 트랙 색. 없으면 트랙 종류의 기본색 */
	color?: string;
	/** 잠긴 트랙의 클립은 선택·편집되지 않는다 */
	locked?: boolean;
	/** 속한 트랙 폴더 */
	folderId?: string;
	/** 사용자가 바꾼 트랙 높이(px). 없으면 트랙 종류의 기본 높이 */
	height?: number;
	/** 사용자가 직접 만든 트랙. 비어 있어도 자동 정리하지 않는다 */
	keepWhenEmpty?: boolean;
}

export interface VideoTrack extends BaseTrack {
	type: "video";
	elements: (VideoElement | ImageElement)[];
	muted: boolean;
	/** 트랙 페이더(dB). 없으면 0 */
	volume?: number;
	/** 팬 -1(왼쪽)~1(오른쪽). 없으면 0 */
	pan?: number;
	/** 솔로. 솔로 트랙이 하나라도 있으면 나머지 트랙은 들리지 않는다 */
	solo?: boolean;
	hidden: boolean;
}

export interface TextTrack extends BaseTrack {
	type: "text";
	elements: TextElement[];
	hidden: boolean;
}

export interface AudioTrack extends BaseTrack {
	type: "audio";
	elements: AudioElement[];
	muted: boolean;
	/** 트랙 페이더(dB). 없으면 0 */
	volume?: number;
	/** 팬 -1(왼쪽)~1(오른쪽). 없으면 0 */
	pan?: number;
	/** 솔로. 솔로 트랙이 하나라도 있으면 나머지 트랙은 들리지 않는다 */
	solo?: boolean;
}

export interface GraphicTrack extends BaseTrack {
	type: "graphic";
	elements: (StickerElement | GraphicElement)[];
	hidden: boolean;
}

export interface EffectTrack extends BaseTrack {
	type: "effect";
	elements: EffectElement[];
	hidden: boolean;
}

export type TimelineTrack =
	| VideoTrack
	| TextTrack
	| AudioTrack
	| GraphicTrack
	| EffectTrack;

export type OverlayTrack = VideoTrack | TextTrack | GraphicTrack | EffectTrack;

/** 장면의 트랙. 타임라인에 보이는 순서(위→아래)이고, 위 트랙이 화면에서도 앞에 그려진다 */
export type SceneTracks = TimelineTrack[];

/** 메인 트랙이 있던 옛 저장 형식(v31까지). 저장할 때 옛 버전을 위해 함께 남긴다 */
export interface LegacySceneTracks {
	overlay: OverlayTrack[];
	main: VideoTrack;
	audio: AudioTrack[];
}

export interface RetimeConfig {
	rate: number;
	maintainPitch?: boolean;
}

interface BaseAudioElement extends BaseTimelineElement {
	type: "audio";
	buffer?: AudioBuffer;
	retime?: RetimeConfig;
}

export interface UploadAudioElement extends BaseAudioElement {
	sourceType: "upload";
	mediaId: string;
}

export interface LibraryAudioElement extends BaseAudioElement {
	sourceType: "library";
	sourceUrl: string;
}

export type AudioElement = UploadAudioElement | LibraryAudioElement;

interface BaseTimelineElement {
	id: string;
	name: string;
	duration: MediaTime;
	startTime: MediaTime;
	trimStart: MediaTime;
	trimEnd: MediaTime;
	sourceDuration?: MediaTime;
	animations?: ElementAnimations;
	params: ParamValues;
	// ⌘G로 묶은 클립 그룹. 같은 값끼리 함께 선택·이동한다
	groupId?: string;
	/** 클립 색. 없으면 트랙 색을 따른다 */
	color?: string;
}

/** 바로 뒤에 맞붙은 클립으로 넘어가는 전환. 맞붙은 클립이 없으면 무시된다 */
export interface ElementTransition {
	/** transitions 레지스트리의 전환 id */
	type: string;
	/** 초 */
	duration: number;
}

export interface VideoElement extends BaseTimelineElement {
	type: "video";
	mediaId: string;
	isSourceAudioEnabled?: boolean;
	hidden?: boolean;
	retime?: RetimeConfig;
	effects?: Effect[];
	masks?: Mask[];
	transition?: ElementTransition;
}

export interface ImageElement extends BaseTimelineElement {
	type: "image";
	mediaId: string;
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
	transition?: ElementTransition;
}

export interface TextElement extends BaseTimelineElement {
	type: "text";
	hidden?: boolean;
	effects?: Effect[];
	/** 자동 자막이나 자막 파일 가져오기로 한 번에 만든 자막 묶음. 자막 목록 패널이 이 값으로 모은다 */
	subtitleGroupId?: string;
	/**
	 * 음성 인식 자막의 단어별 시작 시각(초). 기준은 startTime - trimStart라서 타임라인에서
	 * 앞을 자르거나 나눠도 그대로 맞는다. 자막을 단어 경계에서 나눌 때 쓴다
	 */
	subtitleWordOffsets?: number[];
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	/** Natural dimensions of the sticker asset, stored at insert time. Used by renderer and preview bounds to avoid split-brain geometry. */
	intrinsicWidth?: number;
	intrinsicHeight?: number;
	hidden?: boolean;
	effects?: Effect[];
}

export interface GraphicElement extends BaseTimelineElement {
	type: "graphic";
	definitionId: string;
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
}

export interface EffectElement extends BaseTimelineElement {
	type: "effect";
	effectType: string;
}

export type ElementUpdatePatch = { params?: Partial<ParamValues> };

export type TimelineElement =
	| AudioElement
	| VideoElement
	| ImageElement
	| TextElement
	| StickerElement
	| GraphicElement
	| EffectElement;

export type ElementType = TimelineElement["type"];

function elementTypes<T extends ElementType[]>(...types: T): T {
	return types;
}

export const MASKABLE_ELEMENT_TYPES = elementTypes("video", "image", "graphic");

export type MaskableElement = Extract<
	TimelineElement,
	{ type: (typeof MASKABLE_ELEMENT_TYPES)[number] }
>;

export const RETIMABLE_ELEMENT_TYPES = elementTypes("video", "audio");

export type RetimableElement = Extract<
	TimelineElement,
	{ type: (typeof RETIMABLE_ELEMENT_TYPES)[number] }
>;

export const VISUAL_ELEMENT_TYPES = elementTypes(
	"video",
	"image",
	"text",
	"sticker",
	"graphic",
);

export type VisualElement = Extract<
	TimelineElement,
	{ type: (typeof VISUAL_ELEMENT_TYPES)[number] }
>;

export type CreateUploadAudioElement = Omit<UploadAudioElement, "id">;
export type CreateLibraryAudioElement = Omit<LibraryAudioElement, "id">;
export type CreateAudioElement =
	| CreateUploadAudioElement
	| CreateLibraryAudioElement;
export type CreateVideoElement = Omit<VideoElement, "id">;
export type CreateImageElement = Omit<ImageElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateGraphicElement = Omit<GraphicElement, "id">;
export type CreateEffectElement = Omit<EffectElement, "id">;
export type CreateTimelineElement =
	| CreateAudioElement
	| CreateVideoElement
	| CreateImageElement
	| CreateTextElement
	| CreateStickerElement
	| CreateGraphicElement
	| CreateEffectElement;

export interface ElementDragState {
	isDragging: boolean;
	elementId: string | null;
	dragElementIds: string[];
	dragTimeOffsets: Record<string, MediaTime>;
	trackId: string | null;
	startMouseX: number;
	startMouseY: number;
	startElementTime: MediaTime;
	clickOffsetTime: MediaTime;
	currentTime: MediaTime;
	currentMouseY: number;
}

export type ElementDragView =
	| { readonly kind: "idle" }
	| {
			readonly kind: "dragging";
			readonly anchorElementId: string;
			readonly trackId: string;
			readonly memberTimeOffsets: ReadonlyMap<string, MediaTime>;
			readonly startMouseX: number;
			readonly startMouseY: number;
			readonly startElementTime: MediaTime;
			readonly clickOffsetTime: MediaTime;
			readonly currentTime: MediaTime;
			readonly currentMouseX: number;
			readonly currentMouseY: number;
			readonly dropTarget: DropTarget | null;
	  };

export interface DropTarget {
	trackIndex: number;
	isNewTrack: boolean;
	insertPosition: "above" | "below" | null;
	xPosition: MediaTime;
	targetElement: { elementId: string; trackId: string } | null;
}

export interface ComputeDropTargetParams {
	elementType: ElementType;
	mouseX: number;
	mouseY: number;
	tracks: SceneTracks;
	playheadTime: MediaTime;
	isExternalDrop: boolean;
	elementDuration: MediaTime;
	pixelsPerSecond: number;
	zoomLevel: number;
	verticalDragDirection?: "up" | "down" | null;
	startTimeOverride?: MediaTime;
	excludeElementId?: string;
	targetElementTypes?: string[];
	trackFolders?: TrackFolder[];
}

export interface ClipboardItem {
	trackId: string;
	trackType: TrackType;
	element: CreateTimelineElement;
}
