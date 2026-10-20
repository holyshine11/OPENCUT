import type { TransitionType } from "@/transitions";
import { BaseNode, type AnyBaseNode } from "./base-node";

/**
 * 맞붙은 두 클립 노드를 전환 구간 동안 하나로 섞는다.
 * from·to는 루트의 다른 자식을 가리킬 뿐 이 노드의 자식이 아니다
 */
export type TransitionNodeParams = {
	from: AnyBaseNode;
	to: AnyBaseNode;
	type: TransitionType;
	start: number;
	duration: number;
};

export type ResolvedTransitionNodeState = {
	progress: number;
};

export class TransitionNode extends BaseNode<
	TransitionNodeParams,
	ResolvedTransitionNodeState
> {}
