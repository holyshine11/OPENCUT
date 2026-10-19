export function getPlatformSpecialKey(): string {
	return isAppleDevice() ? "⌘" : "Ctrl";
}

export function getPlatformAlternateKey(): string {
	return isAppleDevice() ? "⌥" : "Alt";
}

export function getPlatformShiftKey(): string {
	return isAppleDevice() ? "⇧" : "Shift";
}

export function isAppleDevice(): boolean {
	return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}
