/**
 * Space를 누른 채 끌면 타임라인 이동, 끌지 않고 떼면 재생.
 * 키 처리(use-keybindings)가 누름/뗌을, 타임라인이 끌기를 기록한다.
 * 커서는 <html data-space-pan>을 보고 globals.css가 바꾼다
 */
let held = false;
let panned = false;

function setRootState(state: "ready" | "active" | null): void {
	const root = document.documentElement;
	if (state) root.dataset.spacePan = state;
	else delete root.dataset.spacePan;
}

export function pressSpace(): void {
	if (held) return;
	held = true;
	panned = false;
	setRootState("ready");
}

/** 끌기 없이 뗐으면 true. 이때만 재생을 토글한다 */
export function releaseSpace(): boolean {
	if (!held) return false;
	held = false;
	setRootState(null);
	return !panned;
}

/** 창 포커스를 잃으면 keyup이 오지 않으니 재생 없이 풀어 준다 */
export function cancelSpace(): void {
	held = false;
	setRootState(null);
}

export function isSpaceHeld(): boolean {
	return held;
}

export function setPanning(active: boolean): void {
	if (active) panned = true;
	setRootState(active ? "active" : held ? "ready" : null);
}
