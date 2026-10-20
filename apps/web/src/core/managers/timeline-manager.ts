import type { EditorCore } from "@/core";
import type { ElementBounds } from "@/preview/element-bounds";
import type { ParamValues } from "@/params";
import type {
	SceneTracks,
	TrackType,
	TimelineTrack,
	TimelineElement,
	RetimeConfig,
	ElementRef,
	TrackFolder,
} from "@/timeline";
import {
	calculateTotalDuration,
	canTrackBeHidden,
	canTrackHaveAudio,
	excludeLockedElements,
} from "@/timeline";
import {
	getFolderMembers,
	getFolderToggleState,
	groupTracksIntoFolder,
	moveTrack,
	ungroupFolder,
} from "@/timeline/track-folders";
import { updateSceneInArray } from "@/timeline/scenes";
import { TimelineDragSource } from "@/timeline/drag-source";
import { findTrackInSceneTracks } from "@/timeline/track-element-update";
import { lastFrameMediaTime, type MediaTime, ZERO_MEDIA_TIME } from "@/wasm";
import {
	canElementBeHidden,
	canElementHaveAudio,
} from "@/timeline/element-utils";
import { isElementMuted } from "@/timeline/audio-state";
import { buildGroupUpdates, buildUngroupUpdates } from "@/timeline/clip-groups";
import { generateUUID } from "@/utils/id";
import type {
	AnimationPath,
	AnimationInterpolation,
	ScalarCurveKeyframePatch,
} from "@/animation/types";
import type { ParamValue } from "@/params";
import {
	getElementLocalTime,
	resolveAnimationPathValueAtTime,
} from "@/animation";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import { BatchCommand } from "@/commands";
import type { Command } from "@/commands/base-command";
import type { Mask } from "@/masks/types";
import { mergeElementPatch } from "@/timeline/update-pipeline";
import { rememberTextStyles } from "@/text/style-memory";
import {
	AddTrackCommand,
	RemoveTrackCommand,
	ToggleTrackMuteCommand,
	ToggleTrackVisibilityCommand,
	UpdateTrackCommand,
	UpdateTrackFoldersCommand,
	InsertElementCommand,
	DeleteElementsCommand,
	DuplicateElementsCommand,
	UpdateElementsCommand,
	SplitElementsCommand,
	MoveElementCommand,
	TracksSnapshotCommand,
	UpsertKeyframeCommand,
	RemoveKeyframeCommand,
	RetimeKeyframeCommand,
	UpdateScalarKeyframeCurveCommand,
	AddClipEffectCommand,
	DeleteFreeformPathMaskPointsCommand,
	InsertFreeformPathMaskPointCommand,
	RemoveClipEffectCommand,
	UpdateClipEffectParamsCommand,
	ToggleClipEffectCommand,
	ReorderClipEffectsCommand,
	RemoveMaskCommand,
	ToggleMaskInvertedCommand,
	UpsertEffectParamKeyframeCommand,
	RemoveEffectParamKeyframeCommand,
	ToggleSourceAudioSeparationCommand,
} from "@/commands/timeline";
import type { InsertElementParams } from "@/commands/timeline/element/insert-element";
import type {
	PlannedElementMove,
	PlannedTrackCreation,
} from "@/timeline/group-move";

export class TimelineManager {
	private listeners = new Set<() => void>();
	private previewOverlay = new Map<string, Partial<TimelineElement>>();
	private previewTracks: SceneTracks | null = null;
	public readonly dragSource = new TimelineDragSource();

	constructor(private editor: EditorCore) {}

	addTrack({ type, index }: { type: TrackType; index?: number }): string {
		const command = new AddTrackCommand({ type, index });
		this.editor.command.execute({ command });
		return command.getTrackId();
	}

	removeTrack({ trackId }: { trackId: string }): void {
		const command = new RemoveTrackCommand(trackId);
		this.editor.command.execute({ command });
	}

	removeTracks({ trackIds }: { trackIds: string[] }): void {
		if (trackIds.length === 0) return;
		const commands = trackIds.map((id) => new RemoveTrackCommand(id));
		this.editor.command.execute({
			command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
		});
	}

	insertElement({ element, placement }: InsertElementParams): void {
		const command = new InsertElementCommand({ element, placement });
		this.editor.command.execute({ command });
	}

	updateElementTrim({
		elementId,
		trimStart,
		trimEnd,
		startTime,
		duration,
		pushHistory = true,
	}: {
		elementId: string;
		trimStart: MediaTime;
		trimEnd: MediaTime;
		startTime?: MediaTime;
		duration?: MediaTime;
		pushHistory?: boolean;
	}): void {
		const trackId = this.findTrackIdForElement({ elementId });
		if (!trackId) {
			return;
		}

		const nextUpdates: Partial<TimelineElement> = {
			trimStart,
			trimEnd,
		};
		if (startTime !== undefined) {
			nextUpdates.startTime = startTime;
		}
		if (duration !== undefined) {
			nextUpdates.duration = duration;
		}

		this.updateElements({
			updates: [
				{
					trackId,
					elementId,
					patch: nextUpdates,
				},
			],
			pushHistory,
		});
	}

	updateElementRetime({
		trackId,
		elementId,
		retime,
		pushHistory = true,
	}: {
		trackId: string;
		elementId: string;
		retime?: RetimeConfig;
		pushHistory?: boolean;
	}): void {
		this.updateElements({
			updates: [
				{
					trackId,
					elementId,
					patch: {
						retime,
					},
				},
			],
			pushHistory,
		});
	}

	moveElements({
		moves,
		createTracks,
		copy,
	}: {
		moves: PlannedElementMove[];
		createTracks?: PlannedTrackCreation[];
		copy?: boolean;
	}): void {
		if (moves.length === 0) {
			return;
		}

		const command = new MoveElementCommand({
			moves,
			createTracks,
			copy,
		});
		this.editor.command.execute({ command });
	}

	toggleTrackMute({ trackId }: { trackId: string }): void {
		const command = new ToggleTrackMuteCommand(trackId);
		this.editor.command.execute({ command });
	}

	toggleTrackVisibility({ trackId }: { trackId: string }): void {
		const command = new ToggleTrackVisibilityCommand(trackId);
		this.editor.command.execute({ command });
	}

	/** color가 없으면 트랙 종류 기본색으로 되돌린다 */
	setTrackColor({
		trackId,
		color,
	}: {
		trackId: string;
		color: string | undefined;
	}): void {
		const command = new UpdateTrackCommand({ trackId, patch: { color } });
		this.editor.command.execute({ command });
	}

	setTrackMix({
		trackId,
		volume,
		pan,
		solo,
	}: {
		trackId: string;
		volume?: number;
		pan?: number;
		solo?: boolean;
	}): void {
		const command = new UpdateTrackCommand({
			trackId,
			patch: { volume, pan, solo },
		});
		this.editor.command.execute({ command });
	}

	renameTrack({ trackId, name }: { trackId: string; name: string }): void {
		const command = new UpdateTrackCommand({ trackId, patch: { name } });
		this.editor.command.execute({ command });
	}

	toggleTrackLock({ trackId }: { trackId: string }): void {
		const track = this.getTrackById({ trackId });
		if (!track) return;

		const command = new UpdateTrackCommand({
			trackId,
			patch: { locked: !track.locked },
		});
		this.editor.command.execute({ command });
		this.deselectLockedElements();
	}

	// 방금 잠근 트랙의 클립이 선택돼 있으면 선택에서 뺀다
	private deselectLockedElements(): void {
		const selected = this.editor.selection.getSelectedElements();
		const tracks = this.editor.scenes.getActiveScene().tracks;
		const unlocked = excludeLockedElements({ tracks, elements: selected });
		if (unlocked.length !== selected.length) {
			this.editor.selection.setSelectedElements({ elements: unlocked });
		}
	}

	/** 고른 트랙(사이에 낀 트랙 포함)을 새 폴더로 묶는다. 이미 폴더에 든 트랙이 끼면 묶지 않는다 */
	groupTracksIntoFolder({
		trackIds,
		name,
	}: {
		trackIds: string[];
		name: string;
	}): void {
		const scene = this.editor.scenes.getActiveScene();
		const folder: TrackFolder = { id: generateUUID(), name };
		const canGroup = groupTracksIntoFolder({
			tracks: scene.tracks,
			folders: scene.trackFolders,
			trackIds,
			folder,
		});
		if (!canGroup) return;

		const command = new UpdateTrackFoldersCommand(
			(current) =>
				groupTracksIntoFolder({
					tracks: current.tracks,
					folders: current.trackFolders,
					trackIds,
					folder,
				}) ?? current,
		);
		this.editor.command.execute({ command });
	}

	/** toIndex는 옮기기 전 같은 영역(오버레이·오디오) 안에서 끼워 넣을 자리 */
	moveTrack({ trackId, toIndex }: { trackId: string; toIndex: number }): void {
		const scene = this.editor.scenes.getActiveScene();
		const result = moveTrack({
			tracks: scene.tracks,
			folders: scene.trackFolders,
			trackId,
			toIndex,
		});
		if (!result) return;
		this.editor.command.execute({
			command: new UpdateTrackFoldersCommand(() => result),
		});
	}

	ungroupTrackFolder({ folderId }: { folderId: string }): void {
		const command = new UpdateTrackFoldersCommand((scene) =>
			ungroupFolder({
				tracks: scene.tracks,
				folders: scene.trackFolders,
				folderId,
			}),
		);
		this.editor.command.execute({ command });
	}

	updateTrackFolder({
		folderId,
		patch,
	}: {
		folderId: string;
		patch: Partial<Pick<TrackFolder, "name" | "color">>;
	}): void {
		const command = new UpdateTrackFoldersCommand((scene) => ({
			tracks: scene.tracks,
			trackFolders: scene.trackFolders?.map((folder) =>
				folder.id === folderId ? { ...folder, ...patch } : folder,
			),
		}));
		this.editor.command.execute({ command });
	}

	/** 접기는 보기만 바꾸므로 되돌리기 기록에 남기지 않는다 */
	toggleTrackFolderCollapsed({ folderId }: { folderId: string }): void {
		const scene = this.editor.scenes.getActiveScene();
		this.editor.scenes.setScenes({
			scenes: updateSceneInArray({
				scenes: this.editor.scenes.getScenes(),
				sceneId: scene.id,
				updates: {
					trackFolders: scene.trackFolders?.map((folder) =>
						folder.id === folderId
							? { ...folder, collapsed: !folder.collapsed }
							: folder,
					),
				},
			}),
		});
	}

	/** 폴더 안 트랙 전체의 음소거·숨김·잠금을 한 번에 맞춘다. 되돌리기는 한 번 */
	toggleTrackFolderFlag({
		folderId,
		flag,
	}: {
		folderId: string;
		flag: "muted" | "hidden" | "locked";
	}): void {
		const members = getFolderMembers({
			tracks: this.editor.scenes.getActiveScene().tracks,
			folderId,
		});
		const turnOn = getFolderToggleState({ members })[flag] !== true;
		const commands = members.flatMap<Command>((track) => {
			if (flag === "locked") {
				return (track.locked === true) === turnOn
					? []
					: [
							new UpdateTrackCommand({
								trackId: track.id,
								patch: { locked: turnOn },
							}),
						];
			}
			if (flag === "muted") {
				return canTrackHaveAudio(track) && track.muted !== turnOn
					? [new ToggleTrackMuteCommand(track.id)]
					: [];
			}
			return canTrackBeHidden(track) && track.hidden !== turnOn
				? [new ToggleTrackVisibilityCommand(track.id)]
				: [];
		});
		if (commands.length === 0) return;

		this.editor.command.execute({ command: new BatchCommand(commands) });
		if (flag === "locked") this.deselectLockedElements();
	}

	/** color가 없으면 트랙 색을 따르게 되돌린다 */
	setElementsColor({
		elements,
		color,
	}: {
		elements: { trackId: string; elementId: string }[];
		color: string | undefined;
	}): void {
		this.updateElements({
			updates: elements.map(({ trackId, elementId }) => ({
				trackId,
				elementId,
				patch: { color },
			})),
		});
	}

	splitElements({
		elements,
		splitTime,
		retainSide = "both",
	}: {
		elements: { trackId: string; elementId: string }[];
		splitTime: MediaTime;
		retainSide?: "both" | "left" | "right";
	}): { trackId: string; elementId: string }[] {
		const splittable = this.excludeLocked({ elements });
		if (splittable.length === 0) return [];

		const command = new SplitElementsCommand({
			elements: splittable,
			splitTime,
			retainSide,
		});
		this.editor.command.execute({ command });
		return command.getRightSideElements();
	}

	getTotalDuration(): MediaTime {
		const activeScene = this.editor.scenes.getActiveSceneOrNull();
		if (!activeScene) {
			return ZERO_MEDIA_TIME;
		}

		return calculateTotalDuration({ tracks: activeScene.tracks });
	}

	getLastFrameTime(): MediaTime {
		const duration = this.getTotalDuration();
		const fps = this.editor.project.getActive()?.settings.fps;
		if (!fps || duration <= 0) return duration;
		return lastFrameMediaTime({ duration, fps });
	}

	getTrackById({ trackId }: { trackId: string }): TimelineTrack | null {
		const activeScene = this.editor.scenes.getActiveSceneOrNull();
		if (!activeScene) {
			return null;
		}

		return findTrackInSceneTracks({ tracks: activeScene.tracks, trackId });
	}

	getElementsWithTracks({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}): Array<{ track: TimelineTrack; element: TimelineElement }> {
		const result: Array<{ track: TimelineTrack; element: TimelineElement }> =
			[];

		for (const { trackId, elementId } of elements) {
			const track = this.getTrackById({ trackId });
			const element = track?.elements.find(
				(trackElement) => trackElement.id === elementId,
			);

			if (track && element) {
				result.push({ track, element });
			}
		}

		return result;
	}

	deleteElements({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}): void {
		// 잠금은 거르지 않는다. 미디어를 지울 때는 잠긴 트랙의 클립도 함께 지워야 한다
		const command = new DeleteElementsCommand({ elements });
		this.editor.command.execute({ command });
	}

	toggleSourceAudioSeparation({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}): void {
		const command = new ToggleSourceAudioSeparationCommand({
			trackId,
			elementId,
		});
		this.editor.command.execute({ command });
	}

	updateElements({
		updates,
		pushHistory = true,
	}: {
		updates: Array<{
			trackId: string;
			elementId: string;
			patch: Partial<TimelineElement>;
		}>;
		pushHistory?: boolean;
	}): void {
		if (updates.length === 0) {
			return;
		}

		const before = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		const command = new UpdateElementsCommand({
			updates,
		});
		if (pushHistory) {
			this.editor.command.execute({ command });
		} else {
			command.execute();
		}
		this.rememberTextStylesOf({
			before,
			elementIds: new Set(updates.map((update) => update.elementId)),
		});
	}

	private rememberTextStylesOf({
		before,
		elementIds,
	}: {
		before: SceneTracks | undefined;
		elementIds: ReadonlySet<string>;
	}): void {
		const tracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!before || !tracks) return;
		rememberTextStyles({
			before,
			tracks,
			elementIds,
			canvasSize: this.editor.project.getActive().settings.canvasSize,
		});
	}

	addClipEffect({
		trackId,
		elementId,
		effectType,
	}: {
		trackId: string;
		elementId: string;
		effectType: string;
	}): string {
		const command = new AddClipEffectCommand({
			trackId,
			elementId,
			effectType,
		});
		this.editor.command.execute({ command });
		return command.getEffectId() ?? "";
	}

	removeClipEffect({
		trackId,
		elementId,
		effectId,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
	}): void {
		const command = new RemoveClipEffectCommand({
			trackId,
			elementId,
			effectId,
		});
		this.editor.command.execute({ command });
	}

	removeMask({
		trackId,
		elementId,
		maskId,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
	}): Command {
		const command = new RemoveMaskCommand({
			trackId,
			elementId,
			maskId,
		});
		command.label = "Delete mask";
		this.editor.command.execute({ command });
		return command;
	}

	/** 마스크 목록을 통째로 바꾼다. 추가·복제·숨기기·순서 변경이 모두 이 한 명령으로 undo된다 */
	updateMasks({
		trackId,
		elementId,
		masks,
		label,
	}: {
		trackId: string;
		elementId: string;
		masks: Mask[];
		label: string;
	}): Command {
		const command = new UpdateElementsCommand({
			updates: [
				{
					trackId,
					elementId,
					patch: { masks } as Partial<TimelineElement>,
				},
			],
		});
		command.label = label;
		this.editor.command.execute({ command });
		return command;
	}

	deleteFreeformPathMaskPoints({
		trackId,
		elementId,
		maskId,
		pointIds,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
		pointIds: string[];
	}): void {
		if (pointIds.length === 0) {
			return;
		}
		const command = new DeleteFreeformPathMaskPointsCommand({
			trackId,
			elementId,
			maskId,
			pointIds,
		});
		this.editor.command.execute({ command });
	}

	insertFreeformPathMaskPoint({
		trackId,
		elementId,
		maskId,
		segmentIndex,
		canvasPoint,
		bounds,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
		segmentIndex: number;
		canvasPoint: { x: number; y: number };
		bounds: ElementBounds;
	}): void {
		const command = new InsertFreeformPathMaskPointCommand({
			trackId,
			elementId,
			maskId,
			segmentIndex,
			canvasPoint,
			bounds,
		});
		this.editor.command.execute({ command });
	}

	updateClipEffectParams({
		trackId,
		elementId,
		effectId,
		params,
		pushHistory = true,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
		params: Partial<ParamValues>;
		pushHistory?: boolean;
	}): void {
		const command = new UpdateClipEffectParamsCommand({
			trackId,
			elementId,
			effectId,
			params,
		});
		if (pushHistory) {
			this.editor.command.execute({ command });
		} else {
			command.execute();
		}
	}

	toggleClipEffect({
		trackId,
		elementId,
		effectId,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
	}): void {
		const command = new ToggleClipEffectCommand({
			trackId,
			elementId,
			effectId,
		});
		this.editor.command.execute({ command });
	}

	toggleMaskInverted({
		trackId,
		elementId,
		maskId,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
	}): Command {
		const command = new ToggleMaskInvertedCommand({
			trackId,
			elementId,
			maskId,
		});
		command.label = "Invert mask";
		this.editor.command.execute({ command });
		return command;
	}

	reorderClipEffects({
		trackId,
		elementId,
		fromIndex,
		toIndex,
	}: {
		trackId: string;
		elementId: string;
		fromIndex: number;
		toIndex: number;
	}): void {
		const command = new ReorderClipEffectsCommand({
			trackId,
			elementId,
			fromIndex,
			toIndex,
		});
		this.editor.command.execute({ command });
	}

	upsertKeyframes({
		keyframes,
	}: {
		keyframes: Array<{
			trackId: string;
			elementId: string;
			propertyPath: AnimationPath;
			time: MediaTime;
			value: ParamValue;
			interpolation?: AnimationInterpolation;
			keyframeId?: string;
		}>;
	}): void {
		if (keyframes.length === 0) {
			return;
		}

		const commands = keyframes.map(
			({
				trackId,
				elementId,
				propertyPath,
				time,
				value,
				interpolation,
				keyframeId,
			}) =>
				new UpsertKeyframeCommand({
					trackId,
					elementId,
					propertyPath,
					time,
					value,
					interpolation,
					keyframeId,
				}),
		);
		const command =
			commands.length === 1 ? commands[0] : new BatchCommand(commands);
		this.editor.command.execute({ command });
	}

	removeKeyframes({
		keyframes,
	}: {
		keyframes: Array<{
			trackId: string;
			elementId: string;
			propertyPath: AnimationPath;
			keyframeId: string;
		}>;
	}): void {
		if (keyframes.length === 0) {
			return;
		}

		// Pre-sample values at playhead for each (element, property) pair.
		// This preserves "what you see is what you get" when all keyframes are deleted.
		const playheadTime = this.editor.playback.getCurrentTime();
		const valueAtPlayheadMap = new Map<string, ParamValue | null>();

		for (const { trackId, elementId, propertyPath } of keyframes) {
			const key = `${elementId}:${propertyPath}`;
			if (valueAtPlayheadMap.has(key)) {
				continue;
			}

			const element = this.getElementByRef({ trackId, elementId });
			if (!element) {
				valueAtPlayheadMap.set(key, null);
				continue;
			}

			const localTime = getElementLocalTime({
				timelineTime: playheadTime,
				elementStartTime: element.startTime,
				elementDuration: element.duration,
			});

			const target = resolveAnimationTarget({ element, path: propertyPath });
			const baseValue = target?.getBaseValue() ?? null;
			if (baseValue === null) {
				valueAtPlayheadMap.set(key, null);
				continue;
			}

			const value = resolveAnimationPathValueAtTime({
				animations: element.animations,
				propertyPath,
				localTime,
				fallbackValue: baseValue,
			});
			valueAtPlayheadMap.set(key, value);
		}

		const commands = keyframes.map(
			({ trackId, elementId, propertyPath, keyframeId }) =>
				new RemoveKeyframeCommand({
					trackId,
					elementId,
					propertyPath,
					keyframeId,
					valueAtPlayhead:
						valueAtPlayheadMap.get(`${elementId}:${propertyPath}`) ?? null,
				}),
		);
		const command =
			commands.length === 1 ? commands[0] : new BatchCommand(commands);
		this.editor.command.execute({ command });
	}

	retimeKeyframe({
		trackId,
		elementId,
		propertyPath,
		keyframeId,
		time,
	}: {
		trackId: string;
		elementId: string;
		propertyPath: AnimationPath;
		keyframeId: string;
		time: MediaTime;
	}): void {
		const command = new RetimeKeyframeCommand({
			trackId,
			elementId,
			propertyPath,
			keyframeId,
			nextTime: time,
		});
		this.editor.command.execute({ command });
	}

	updateKeyframeCurves({
		keyframes,
	}: {
		keyframes: Array<{
			trackId: string;
			elementId: string;
			propertyPath: AnimationPath;
			componentKey: string;
			keyframeId: string;
			patch: ScalarCurveKeyframePatch;
		}>;
	}): void {
		if (keyframes.length === 0) {
			return;
		}

		const commands = keyframes.map(
			({ trackId, elementId, propertyPath, componentKey, keyframeId, patch }) =>
				new UpdateScalarKeyframeCurveCommand({
					trackId,
					elementId,
					propertyPath,
					componentKey,
					keyframeId,
					patch,
				}),
		);
		const command =
			commands.length === 1 ? commands[0] : new BatchCommand(commands);
		this.editor.command.execute({ command });
	}

	upsertEffectParamKeyframe({
		trackId,
		elementId,
		effectId,
		paramKey,
		time,
		value,
		interpolation,
		keyframeId,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
		paramKey: string;
		time: MediaTime;
		value: number;
		interpolation?: "linear" | "hold";
		keyframeId?: string;
	}): void {
		const command = new UpsertEffectParamKeyframeCommand({
			trackId,
			elementId,
			effectId,
			paramKey,
			time,
			value,
			interpolation,
			keyframeId,
		});
		this.editor.command.execute({ command });
	}

	removeEffectParamKeyframe({
		trackId,
		elementId,
		effectId,
		paramKey,
		keyframeId,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
		paramKey: string;
		keyframeId: string;
	}): void {
		const command = new RemoveEffectParamKeyframeCommand({
			trackId,
			elementId,
			effectId,
			paramKey,
			keyframeId,
		});
		this.editor.command.execute({ command });
	}

	isPreviewActive(): boolean {
		return this.previewOverlay.size > 0;
	}

	previewElements({
		updates,
	}: {
		updates: readonly {
			trackId: string;
			elementId: string;
			updates: Partial<TimelineElement>;
		}[];
	}): void {
		let changedOverlayCount = 0;
		for (const { elementId, updates: elementUpdates } of updates) {
			const existingOverlay = this.previewOverlay.get(elementId);
			const existingValues = new Map<string, unknown>(
				Object.entries(existingOverlay ?? {}),
			);
			const changed = Object.entries(elementUpdates).some(
				([key, value]) => !Object.is(existingValues.get(key), value),
			);
			if (changed) {
				changedOverlayCount += 1;
				// 스프레드는 종류별 Partial 합집합을 섞어 타입이 깨져서 Object.assign으로 합친다
				const mergedOverlay: Partial<TimelineElement> = Object.assign(
					{},
					existingOverlay,
					elementUpdates,
				);
				this.previewOverlay.set(elementId, mergedOverlay);
			}
		}
		const committedTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!committedTracks) {
			return;
		}
		if (changedOverlayCount === 0) {
			return;
		}
		this.previewTracks = this.applyPreviewOverlay(committedTracks);
		this.notify();
	}

	commitPreview({ label }: { label?: string } = {}): void {
		if (this.previewOverlay.size === 0) return;
		const committedTracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!committedTracks) {
			return;
		}
		const afterTracks =
			this.previewTracks ?? this.applyPreviewOverlay(committedTracks);
		const command = new TracksSnapshotCommand({
			before: committedTracks,
			after: afterTracks,
		});
		command.label = label;
		this.editor.command.push({ command });
		const elementIds = new Set(this.previewOverlay.keys());
		this.previewOverlay.clear();
		this.previewTracks = null;
		this.updateTracks(afterTracks);
		this.rememberTextStylesOf({ before: committedTracks, elementIds });
	}

	discardPreview(): void {
		if (this.previewOverlay.size === 0) return;
		this.previewOverlay.clear();
		this.previewTracks = null;
		this.notify();
	}

	private applyPreviewOverlay(tracks: SceneTracks): SceneTracks {
		if (this.previewOverlay.size === 0) return tracks;

		const applyTrackOverlay = <TTrack extends TimelineTrack>(
			track: TTrack,
		): TTrack => {
			const hasOverlay = track.elements.some((element) =>
				this.previewOverlay.has(element.id),
			);
			if (!hasOverlay) {
				return track;
			}

			const nextElements = track.elements.map((element) => {
				const overlay = this.previewOverlay.get(element.id);
				// params는 실제 업데이트(applyElementUpdate)처럼 합친다. 덮어쓰면 글자만 고쳐도 스타일이 사라진다
				return overlay
					? mergeElementPatch({ element, patch: overlay })
					: element;
			});

			return { ...track, elements: nextElements } as TTrack;
		};

		return tracks.map((track) => applyTrackOverlay(track));
	}

	duplicateElements({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}): { trackId: string; elementId: string }[] {
		const command = new DuplicateElementsCommand({ elements });
		this.editor.command.execute({ command });
		return command.getDuplicatedElements();
	}

	toggleElementsVisibility({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}): void {
		const shouldHide = elements.some(({ trackId, elementId }) => {
			const element = this.getElementByRef({ trackId, elementId });
			return element && canElementBeHidden(element) && !element.hidden;
		});

		const nextUpdates = elements.flatMap(({ trackId, elementId }) => {
			const element = this.getElementByRef({ trackId, elementId });
			if (!element || !canElementBeHidden(element)) {
				return [];
			}

			return [
				{
					trackId,
					elementId,
					patch: { hidden: shouldHide },
				},
			];
		});

		this.updateElements({ updates: nextUpdates });
	}

	groupElements({ elements }: { elements: ElementRef[] }): void {
		this.updateElements({
			updates: buildGroupUpdates({
				tracks: this.editor.scenes.getActiveScene().tracks,
				elements,
				groupId: generateUUID(),
			}),
		});
	}

	ungroupElements({ elements }: { elements: ElementRef[] }): void {
		this.updateElements({
			updates: buildUngroupUpdates({
				tracks: this.editor.scenes.getActiveScene().tracks,
				elements,
			}),
		});
	}

	toggleElementsMuted({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}): void {
		const shouldMute = elements.some(({ trackId, elementId }) => {
			const element = this.getElementByRef({ trackId, elementId });
			return (
				element && canElementHaveAudio(element) && !isElementMuted({ element })
			);
		});

		const nextUpdates = elements.flatMap(({ trackId, elementId }) => {
			const element = this.getElementByRef({ trackId, elementId });
			if (!element || !canElementHaveAudio(element)) {
				return [];
			}

			return [
				{
					trackId,
					elementId,
					patch: { params: { muted: shouldMute } },
				},
			];
		});

		this.updateElements({ updates: nextUpdates });
	}

	getPreviewTracks(): SceneTracks | null {
		return (
			this.previewTracks ??
			this.editor.scenes.getActiveSceneOrNull()?.tracks ??
			null
		);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}

	private excludeLocked<TRef extends { trackId: string }>({
		elements,
	}: {
		elements: readonly TRef[];
	}): TRef[] {
		const tracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		return tracks ? excludeLockedElements({ tracks, elements }) : [];
	}

	private getElementByRef({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}): TimelineElement | undefined {
		return this.getTrackById({ trackId })?.elements.find(
			(element) => element.id === elementId,
		);
	}

	private findTrackIdForElement({
		elementId,
	}: {
		elementId: string;
	}): string | null {
		const activeScene = this.editor.scenes.getActiveSceneOrNull();
		if (!activeScene) {
			return null;
		}

		return (
			activeScene.tracks.find((track) =>
				track.elements.some((element) => element.id === elementId),
			)?.id ?? null
		);
	}

	updateTracks(newTracks: SceneTracks): void {
		this.previewOverlay.clear();
		this.previewTracks = null;
		this.editor.scenes.updateSceneTracks({ tracks: newTracks });
		this.notify();
	}
}
