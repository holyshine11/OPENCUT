/* tslint:disable */
/* eslint-disable */
/**
 * `TextElement.textAnimation`과 같은 모양
 */
export interface TextAnimation {
    in?: TextRevealSlot | undefined;
    out?: TextRevealSlot | undefined;
    loop?: TextLoopSlot | undefined;
}

/**
 * 렌더에 실제로 쓰는 인/아웃 길이(초)
 */
export interface EffectiveDurations {
    inSeconds: number;
    outSeconds: number;
}

/**
 * 한 유닛(지금은 텍스트 전체)에 덧씌울 변화. dx/dy는 텍스트 박스 너비/높이 비율,
 * rotate는 도, blur는 텍스트 높이 비율
 */
export interface UnitState {
    dx: number;
    dy: number;
    scale: number;
    rotate: number;
    opacity: number;
    blur: number;
}

export interface FloorToFrameOptions {
    time: MediaTime;
    rate: FrameRate;
}

export interface FormatTimecodeOptions {
    time: MediaTime;
    format?: TimeCodeFormat;
    rate?: FrameRate;
}

export interface FrameRate {
    numerator: number;
    denominator: number;
}

export interface GuessTimecodeFormatOptions {
    timeCode: string;
}

export interface IsFrameAlignedOptions {
    time: MediaTime;
    rate: FrameRate;
}

export interface LastFrameTimeOptions {
    duration: MediaTime;
    rate: FrameRate;
}

export interface MediaTimeAddOptions {
    lhs: MediaTime;
    rhs: MediaTime;
}

export interface MediaTimeClampOptions {
    time: MediaTime;
    min: MediaTime;
    max: MediaTime;
}

export interface MediaTimeFromFrameOptions {
    frame: number;
    rate: FrameRate;
}

export interface MediaTimeFromSecondsOptions {
    seconds: number;
}

export interface MediaTimeMaxOptions {
    lhs: MediaTime;
    rhs: MediaTime;
}

export interface MediaTimeMinOptions {
    lhs: MediaTime;
    rhs: MediaTime;
}

export interface MediaTimeSubOptions {
    lhs: MediaTime;
    rhs: MediaTime;
}

export interface MediaTimeToFrameOptions {
    time: MediaTime;
    rate: FrameRate;
}

export interface MediaTimeToSecondsOptions {
    time: MediaTime;
}

export interface ParseTimecodeOptions {
    timeCode: string;
    format?: TimeCodeFormat;
    rate?: FrameRate;
}

export interface ResolveTextAnimationOptions {
    animation?: TextAnimation;
    /**
     * 클립 시작부터 지난 초
     */
    localSeconds: number;
    clipSeconds: number;
}

export interface ResolveTextAnimationUnitsOptions {
    animation?: TextAnimation;
    localSeconds: number;
    clipSeconds: number;
    /**
     * 그리는 단위(읽는 순서)마다 몇 번째 단어인지
     */
    wordOf: number[];
    /**
     * 그리는 단위마다 몇 번째 줄인지
     */
    lineOf: number[];
}

export interface RoundToFrameOptions {
    time: MediaTime;
    rate: FrameRate;
}

export interface SliderRange {
    min: number;
    max: number;
    enabled: boolean;
}

export interface SnappedSeekTimeOptions {
    time: MediaTime;
    duration: MediaTime;
    rate: FrameRate;
}

export interface TextAnimationEffectiveDurationsOptions {
    animation?: TextAnimation;
    clipSeconds: number;
}

export interface TextAnimationPresets {
    reveal: string[];
    loop: string[];
    /**
     * 글자/단어/줄 단위로 그려야 하는 프리셋 id. 이 중 하나라도 걸린 클립은 클립 전체를 단위별로 그린다
     */
    units: string[];
}

export interface TextAnimationSliderRangeOptions {
    clipSeconds: number;
    /**
     * 반대쪽 슬롯의 유효 길이
     */
    otherSeconds: number;
    /**
     * 이 슬롯의 유효 길이
     */
    currentSeconds: number;
}

export interface TextAnimationUnits {
    /**
     * 단위마다 덧씌울 변화. dx/dy는 줄 높이 비율, 중심은 단위의 가운데. 유닛 프리셋이 없으면 빈 배열
     */
    states: UnitState[];
}

export interface TextLoopSlot {
    type: string;
    /**
     * 한 바퀴 초
     */
    period: number;
    /**
     * 반복이 이미 진행된 초. 분할한 오른쪽 조각이 이어서 돌도록 분할 지점까지 지난 시간을 담는다
     */
    offset?: number;
}

export interface TextRevealSlot {
    type: string;
    /**
     * 초
     */
    duration: number;
}

export type MediaTime = number;

export type TimeCodeFormat = "MM:SS" | "HH:MM:SS" | "HH:MM:SS:CS" | "HH:MM:SS:FF";


export function TEXT_ANIMATION_DEFAULT_DURATION(): number;

export function TEXT_ANIMATION_DEFAULT_LOOP_PERIOD(): number;

export function TEXT_ANIMATION_MAX_LOOP_PERIOD(): number;

export function TEXT_ANIMATION_MIN_DURATION(): number;

export function TEXT_ANIMATION_MIN_LOOP_PERIOD(): number;

export function TICKS_PER_SECOND(): number;

export function applyEffectPasses(options: any): OffscreenCanvas;

export function applyMaskFeather(options: any): OffscreenCanvas;

export function floorToFrame(arg0: FloorToFrameOptions): MediaTime | undefined;

export function formatTimecode(arg0: FormatTimecodeOptions): string | undefined;

export function getCompositorCanvas(): HTMLCanvasElement;

export function getLastFrameProfile(): Array<any>;

export function guessTimecodeFormat(arg0: GuessTimecodeFormatOptions): TimeCodeFormat | undefined;

export function initCompositor(width: number, height: number): void;

export function initializeGpu(): Promise<void>;

export function isFrameAligned(arg0: IsFrameAlignedOptions): boolean | undefined;

export function lastFrameTime(arg0: LastFrameTimeOptions): MediaTime | undefined;

export function mediaTimeAdd(arg0: MediaTimeAddOptions): MediaTime;

export function mediaTimeClamp(arg0: MediaTimeClampOptions): MediaTime;

export function mediaTimeFromFrame(arg0: MediaTimeFromFrameOptions): MediaTime | undefined;

export function mediaTimeFromSeconds(arg0: MediaTimeFromSecondsOptions): MediaTime | undefined;

export function mediaTimeMax(arg0: MediaTimeMaxOptions): MediaTime;

export function mediaTimeMin(arg0: MediaTimeMinOptions): MediaTime;

export function mediaTimeSub(arg0: MediaTimeSubOptions): MediaTime;

export function mediaTimeToFrame(arg0: MediaTimeToFrameOptions): bigint | undefined;

export function mediaTimeToSeconds(arg0: MediaTimeToSecondsOptions): number;

export function parseTimecode(arg0: ParseTimecodeOptions): MediaTime | undefined;

export function releaseTexture(id: string): void;

export function renderFrame(options: any): void;

export function resizeCompositor(width: number, height: number): void;

/**
 * 한 시점에 텍스트 전체에 덧씌울 변화. 인/아웃 구간과 반복이 겹치면 둘 다 적용한다
 */
export function resolveTextAnimation(arg0: ResolveTextAnimationOptions): UnitState;

/**
 * 유닛 프리셋(타자기, 글자 웨이브 등)의 단위별 상태. 블록 프리셋은 resolve_text_animation이 맡는다
 */
export function resolveTextAnimationUnits(arg0: ResolveTextAnimationUnitsOptions): TextAnimationUnits;

export function roundToFrame(arg0: RoundToFrameOptions): MediaTime | undefined;

export function snappedSeekTime(arg0: SnappedSeekTimeOptions): MediaTime | undefined;

export function textAnimationEffectiveDurations(arg0: TextAnimationEffectiveDurationsOptions): EffectiveDurations;

export function textAnimationPresets(): TextAnimationPresets;

/**
 * 인/아웃 길이 슬라이더 범위. 최대를 먼저 구하고 최소가 최대를 넘지 않게 한다
 */
export function textAnimationSliderRange(arg0: TextAnimationSliderRangeOptions): SliderRange;

export function uploadTexture(options: any): void;
