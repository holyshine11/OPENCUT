import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface VideoNodeParams extends VisualNodeParams {
	url: string;
	file: File;
	mediaId: string;
	/** 영상 디코더 캐시 키. 같은 영상의 두 시점을 동시에 그리는 전환 구간에서 디코더를 나눠 쓴다 */
	cacheKey: string;
}

export class VideoNode extends VisualNode<
	VideoNodeParams,
	ResolvedVisualSourceNodeState
> {}
