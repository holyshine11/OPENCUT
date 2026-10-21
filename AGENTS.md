# Agents.md

## Architecture

An ongoing migration is moving all business logic into `rust/`. Each app under `apps/` is a UI shell — it owns rendering, interaction, and platform-specific concerns, but never owns logic. The UI framework for any given app is a replaceable detail.

### `rust/`

The single source of truth for all non-UI code. Everything platform-agnostic belongs here: no components, no hooks, no framework imports.

The web app uses the local build in `rust/wasm/pkg` (`"opencut-wasm": "file:…"`), not the npm package, and the build is committed so a fresh clone needs no Rust toolchain. After changing anything under `rust/`, run `bun run build:wasm` (rebuilds and reinstalls) and commit `rust/wasm/pkg` with the change. A stale build shows up as `Invalid frame descriptor: missing field …` at runtime.

### `apps/`

Each app is a frontend that calls into Rust. Logic is never duplicated between apps — only UI is, because each platform may use an entirely different framework and language to build it.

- `web/` — Next.js
- `desktop/` — GPUI

## Web

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.

### Sliders

Every value slider resets to its default on ⌘-click (Ctrl-click off Apple). When you add a slider:

- Use `Slider` from `@/components/ui/slider` and pass `onReset`. It must set **and commit** the default (one undo step), reusing the field's existing reset (the number field's ⏎ `onReset`) when there is one.
- A hand-built Radix root (e.g. `SliderRow` in `effects/components/adjust-controls.tsx`) gets `onPointerDown={withResetClick({ onReset })}`.
- A custom drag control (e.g. the clip volume line) checks `isResetClick(event)` at pointer-down.
- Take the default from a named constant or the param definition (`param.default`, `slider.default`, `DEFAULT_RETIME_RATE`, `VOLUME_DB_DEFAULT`), never a literal.
- Sliders without a meaningful default (timeline zoom) are the only exception.


## Agent skills

### Issue tracker

Issues live in GitHub Issues for holyshine11/OPENCUT, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

See `docs/agents/domain.md`.
