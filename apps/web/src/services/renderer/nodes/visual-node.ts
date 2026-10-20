import { BaseNode } from "./base-node";
import type { Effect, EffectPass } from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { BlendMode, Transform } from "@/rendering";
import type { RetimeConfig, VisualElement } from "@/timeline";

export interface VisualNodeParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	retime?: RetimeConfig;
	transform: Transform;
	animations?: VisualElement["animations"];
	opacity: number;
	blendMode?: BlendMode;
	effects?: Effect[];
	masks?: Mask[];
	/** 전환 구간 때문에 클립 앞뒤로 더 그릴 길이(틱). 원본이 모자라면 첫·끝 프레임에서 멈춘다 */
	extendBefore?: number;
	extendAfter?: number;
}

export interface ResolvedVisualNodeState {
	localTime: number;
	transform: Transform;
	opacity: number;
	effectPasses: EffectPass[][];
	/** 키프레임을 반영한 이 시점의 마스크 */
	masks: Mask[];
}

export interface ResolvedVisualSourceNodeState extends ResolvedVisualNodeState {
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
}

export abstract class VisualNode<
	Params extends VisualNodeParams = VisualNodeParams,
	Resolved extends ResolvedVisualNodeState = ResolvedVisualNodeState,
> extends BaseNode<Params, Resolved> {}
