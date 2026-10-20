import type {
	TAction,
	TActionFunc,
	TActionWithArgs,
	TActionWithOptionalArgs,
	TActionArgsMap,
	TArgOfAction,
	TInvocationTrigger,
	TBoundActionList,
} from "./types";

const boundActions: TBoundActionList = {};

// eslint-disable-next-line opencut/prefer-object-params -- action registries read best as (action, handler).
export function bindAction<A extends TAction>(
	action: A,
	handler: TActionFunc<A>,
) {
	const handlers: TBoundActionList[A] = (boundActions[action] ??= []);
	handlers?.push(handler);
}

// eslint-disable-next-line opencut/prefer-object-params -- action registries read best as (action, handler).
export function unbindAction<A extends TAction>(
	action: A,
	handler: TActionFunc<A>,
) {
	const handlers: TBoundActionList[A] = boundActions[action];
	if (!handlers) return;

	const index = handlers.indexOf(handler);
	if (index >= 0) handlers.splice(index, 1);

	if (boundActions[action]?.length === 0) {
		delete boundActions[action];
	}
}

type InvokeActionFunc = {
	(
		action: TActionWithOptionalArgs,
		args?: undefined,
		trigger?: TInvocationTrigger,
	): void;
	<A extends TActionWithArgs>(
		action: A,
		args: TActionArgsMap[A],
		trigger?: TInvocationTrigger,
	): void;
};

// eslint-disable-next-line opencut/prefer-object-params -- dispatchers conventionally separate action, payload, and trigger.
export const invokeAction: InvokeActionFunc = <A extends TAction>(
	action: A,
	args: TArgOfAction<A>,
	trigger?: TInvocationTrigger,
) => {
	const handlers: TBoundActionList[A] = boundActions[action];
	// 핸들러가 실행 중에 자기 바인딩을 풀 수 있어 복사본을 돈다
	handlers?.slice().forEach((handler) => {
		handler(args, trigger);
	});
};
