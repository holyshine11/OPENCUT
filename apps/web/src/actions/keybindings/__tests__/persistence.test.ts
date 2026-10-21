import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import {
	decodePersistedKeybindingsState,
	migratePersistedKeybindingsState,
	parseImportedKeybindings,
	serializeKeybindingsState,
} from "../persistence";

describe("keybinding persistence", () => {
	let warnSpy: ReturnType<typeof mock>;
	let originalWarn: typeof console.warn;

	beforeEach(() => {
		originalWarn = console.warn;
		warnSpy = mock(() => {});
		console.warn = warnSpy;
	});

	afterEach(() => {
		console.warn = originalWarn;
	});

	test("migrates legacy persisted keybindings before decoding them", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: {
					s: "split-selected",
					"ctrl+v": "paste-selected",
				},
				isCustomized: true,
			},
			fromVersion: 2,
		});

		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded).not.toBeNull();
		if (!decoded) throw new Error("Expected migrated keybindings to decode");

		expect(decoded.isCustomized).toBe(true);
		expect(decoded.keybindings.get("s")).toBe("split");
		expect(decoded.keybindings.get("ctrl+v")).toBe("paste-style");
		expect(decoded.keybindings.get("escape")).toBe("cancel-interaction");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("filters invalid persisted entries at the boundary and warns", () => {
		const decoded = decodePersistedKeybindingsState({
			state: {
				keybindings: {
					space: "toggle-play",
					"shift+bogus": "toggle-play",
					"ctrl+v": "not-an-action",
				},
				isCustomized: false,
			},
		});

		expect(decoded).not.toBeNull();
		if (!decoded) throw new Error("Expected persisted keybindings to decode");

		expect(Array.from(decoded.keybindings.entries())).toEqual([
			["space", "toggle-play"],
		]);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("returns null and warns when persisted shape is unrecognizable", () => {
		const decoded = decodePersistedKeybindingsState({ state: "garbage" });
		expect(decoded).toBeNull();
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("round-trips actions that have no default shortcut", () => {
		// `stop-playback` is a valid `TActionWithOptionalArgs` but is not in the
		// defaults table; the validator must still accept it.
		const serialized = serializeKeybindingsState({
			keybindings: new Map([
				["space", "toggle-play"],
				["x", "stop-playback"],
				["b", "toggle-bookmark"],
			]),
			isCustomized: true,
		});

		const decoded = decodePersistedKeybindingsState({ state: serialized });
		expect(decoded).not.toBeNull();
		if (!decoded) throw new Error("Expected round-tripped keybindings");

		expect(decoded.keybindings.get("space")).toBe("toggle-play");
		expect(decoded.keybindings.get("x")).toBe("stop-playback");
		expect(decoded.keybindings.get("b")).toBe("toggle-bookmark");
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe("parseImportedKeybindings", () => {
	test("accepts a valid configuration", () => {
		const result = parseImportedKeybindings({
			config: {
				space: "toggle-play",
				x: "stop-playback",
			},
		});

		expect(result.get("space")).toBe("toggle-play");
		expect(result.get("x")).toBe("stop-playback");
	});

	test("throws on non-object input", () => {
		expect(() => parseImportedKeybindings({ config: null })).toThrow(
			/JSON object/,
		);
		expect(() => parseImportedKeybindings({ config: [] })).toThrow(
			/JSON object/,
		);
	});

	test("throws on non-string action values", () => {
		expect(() =>
			parseImportedKeybindings({ config: { space: 42 } }),
		).toThrow(/expected string/);
	});

	test("throws on invalid shortcut keys", () => {
		expect(() =>
			parseImportedKeybindings({
				config: { "shift+bogus": "toggle-play" },
			}),
		).toThrow(/shift\+bogus/);
	});

	test("throws on invalid actions", () => {
		expect(() =>
			parseImportedKeybindings({ config: { space: "not-an-action" } }),
		).toThrow(/not-an-action/);
	});
});

describe("v7 to v8 migration", () => {
	test("adds style copy/paste shortcuts without overriding user bindings", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: { "ctrl+alt+v": "split" },
				isCustomized: true,
			},
			fromVersion: 7,
		});
		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded?.keybindings.get("ctrl+alt+c")).toBe("copy-selected");
		expect(decoded?.keybindings.get("ctrl+alt+v")).toBe("split");
	});
});

describe("v8 to v9 migration", () => {
	test("adds timeline zoom shortcuts without overriding user bindings", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: { g: "split" },
				isCustomized: true,
			},
			fromVersion: 8,
		});
		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded?.keybindings.get("g")).toBe("split");
		expect(decoded?.keybindings.get("h")).toBe("timeline-zoom-in");
	});

	test("swaps default element/style copy-paste shortcuts", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: {
					"ctrl+c": "copy-selected",
					"ctrl+v": "paste-copied",
					"ctrl+alt+c": "copy-style",
					"ctrl+alt+v": "paste-style",
				},
				isCustomized: true,
			},
			fromVersion: 8,
		});
		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded?.keybindings.get("ctrl+c")).toBe("copy-style");
		expect(decoded?.keybindings.get("ctrl+v")).toBe("paste-style");
		expect(decoded?.keybindings.get("ctrl+alt+c")).toBe("copy-selected");
		expect(decoded?.keybindings.get("ctrl+alt+v")).toBe("paste-copied");
	});

	test("keeps customized copy-paste shortcuts", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: { "ctrl+c": "split", "ctrl+alt+v": "undo" },
				isCustomized: true,
			},
			fromVersion: 8,
		});
		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded?.keybindings.get("ctrl+c")).toBe("split");
		expect(decoded?.keybindings.get("ctrl+v")).toBe("paste-style");
		expect(decoded?.keybindings.get("ctrl+alt+c")).toBe("copy-selected");
		expect(decoded?.keybindings.get("ctrl+alt+v")).toBe("undo");
	});

	test("adds caption split/merge shortcuts unless taken", () => {
		const migrated = migratePersistedKeybindingsState({
			state: {
				keybindings: { "shift+enter": "split" },
				isCustomized: true,
			},
			fromVersion: 8,
		});
		const decoded = decodePersistedKeybindingsState({ state: migrated });
		expect(decoded?.keybindings.get("shift+enter")).toBe("split");
		expect(decoded?.keybindings.get("shift+backspace")).toBe(
			"merge-caption-with-next",
		);
	});
});

describe("v9 to v10 migration", () => {
	test("adds C as a split shortcut unless taken", () => {
		const added = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { s: "split" }, isCustomized: true },
				fromVersion: 9,
			}),
		});
		expect(added?.keybindings.get("c")).toBe("split");
		expect(added?.keybindings.get("s")).toBe("split");
		expect(added?.keybindings.get("ctrl+g")).toBe("group-selected");
		expect(added?.keybindings.get("ctrl+shift+g")).toBe("ungroup-selected");

		const kept = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { c: "undo" }, isCustomized: true },
				fromVersion: 9,
			}),
		});
		expect(kept?.keybindings.get("c")).toBe("undo");
	});
});

describe("v13 to v14 migration", () => {
	test("restores group shortcuts missed by users who passed v10 early", () => {
		const added = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { c: "split" }, isCustomized: false },
				fromVersion: 13,
			}),
		});
		expect(added?.keybindings.get("ctrl+g")).toBe("group-selected");
		expect(added?.keybindings.get("ctrl+shift+g")).toBe("ungroup-selected");

		const kept = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { "ctrl+g": "undo" }, isCustomized: true },
				fromVersion: 13,
			}),
		});
		expect(kept?.keybindings.get("ctrl+g")).toBe("undo");
	});
});

describe("v14 to v15 migration", () => {
	test("adds the previously unbound toggle shortcuts", () => {
		const added = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { c: "split" }, isCustomized: false },
				fromVersion: 14,
			}),
		});
		expect(added?.keybindings.get("m")).toBe("toggle-bookmark");
		expect(added?.keybindings.get("shift+space")).toBe("stop-playback");

		const kept = decodePersistedKeybindingsState({
			state: migratePersistedKeybindingsState({
				state: { keybindings: { m: "undo" }, isCustomized: true },
				fromVersion: 14,
			}),
		});
		expect(kept?.keybindings.get("m")).toBe("undo");
	});
});
