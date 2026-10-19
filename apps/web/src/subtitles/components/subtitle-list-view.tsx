import { useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitMergeIcon, ScissorIcon } from "@hugeicons/core-free-icons";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/editor/use-editor";
import { listSubtitleGroups, type SubtitleEntry } from "@/subtitles/groups";
import { formatCueTime, parseCueTime } from "@/subtitles/edit";
import {
	cueOf,
	mergeSubtitles,
	retimeSubtitle,
	splitSubtitle,
} from "@/subtitles/list-actions";

/** 자막 그룹 하나를 시간순 목록으로 보여 주고, 텍스트 수정·분할·병합·시간 조정과 해당 시점 이동을 한다 */
export function SubtitleListView() {
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const groups = useMemo(
		() => (scene ? listSubtitleGroups({ tracks: scene.tracks }) : []),
		[scene],
	);
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	const group =
		groups.find((candidate) => candidate.groupId === selectedGroupId) ?? groups.at(-1);

	return (
		<PanelView title="Subtitle list">
			{!group ? (
				<p className="text-muted-foreground px-3 text-sm">
					Generate or import captions in the Captions tab to edit them here.
				</p>
			) : (
				<div className="flex flex-col gap-2 px-3 pb-3">
					{groups.length > 1 && (
						<Select value={group.groupId} onValueChange={setSelectedGroupId}>
							<SelectTrigger aria-label="Subtitle group">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{groups.map((candidate, index) => (
									<SelectItem key={candidate.groupId} value={candidate.groupId}>
										{`Subtitles ${index + 1} (${candidate.entries.length})`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<ol className="flex flex-col gap-1.5">
						{group.entries.map((entry, index) => (
							<SubtitleRow
								key={entry.element.id}
								entry={entry}
								previous={group.entries[index - 1]}
								next={group.entries[index + 1]}
								isActive={entry.element.id === activeId}
								onActivate={() => setActiveId(entry.element.id)}
							/>
						))}
					</ol>
				</div>
			)}
		</PanelView>
	);
}

function SubtitleRow({
	entry,
	previous,
	next,
	isActive,
	onActivate,
}: {
	entry: SubtitleEntry;
	previous: SubtitleEntry | undefined;
	next: SubtitleEntry | undefined;
	isActive: boolean;
	onActivate: () => void;
}) {
	const editor = useEditor();
	const { element, trackId } = entry;
	const cue = cueOf({ entry });
	const [draft, setDraft] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const commit = () => {
		if (draft === null) return;
		if (draft !== cue.text) {
			editor.timeline.updateElements({
				updates: [{ trackId, elementId: element.id, patch: { params: { content: draft } } }],
			});
		}
		setDraft(null);
	};

	const jumpTo = () => {
		onActivate();
		editor.playback.seek({ time: element.startTime });
		editor.selection.setSelectedElements({
			elements: [{ trackId, elementId: element.id }],
		});
	};

	const split = () => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const didSplit = splitSubtitle({
			editor,
			entry,
			text: textarea.value,
			at: textarea.selectionStart,
		});
		if (didSplit) setDraft(null);
	};

	const text = draft ?? cue.text;

	return (
		<li className="flex flex-col gap-1">
			<div className="flex gap-2">
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground w-12 shrink-0 pt-1.5 text-left text-xs tabular-nums"
					aria-label={`Go to ${formatCueTime({ seconds: cue.start })}`}
					onClick={jumpTo}
				>
					{formatCueTime({ seconds: cue.start })}
				</button>
				<Textarea
					ref={textareaRef}
					value={text}
					rows={Math.max(1, text.split("\n").length)}
					className="min-h-0 resize-none py-1 text-sm"
					onFocus={jumpTo}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.preventDefault();
							event.currentTarget.blur();
						}
					}}
				/>
			</div>
			{isActive && (
				<div className="flex items-center gap-1 pl-14">
					<CueTimeInput
						label="Start"
						seconds={cue.start}
						onCommit={(start) =>
							retimeSubtitle({ editor, entry, start, end: cue.end, previous, next })
						}
					/>
					<CueTimeInput
						label="End"
						seconds={cue.end}
						onCommit={(end) =>
							retimeSubtitle({ editor, entry, start: cue.start, end, previous, next })
						}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Split at cursor"
						title="Split at cursor"
						// 텍스트 칸의 커서 위치를 잃지 않도록 포커스를 옮기지 않는다
						onMouseDown={(event) => event.preventDefault()}
						onClick={split}
					>
						<HugeiconsIcon icon={ScissorIcon} size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Merge with next"
						title="Merge with next"
						disabled={!next}
						onClick={() => next && mergeSubtitles({ editor, first: entry, second: next })}
					>
						<HugeiconsIcon icon={GitMergeIcon} size={14} />
					</Button>
				</div>
			)}
		</li>
	);
}

function CueTimeInput({
	label,
	seconds,
	onCommit,
}: {
	label: string;
	seconds: number;
	onCommit: (seconds: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		const parsed = draft === null ? null : parseCueTime({ input: draft });
		if (parsed !== null && parsed !== seconds) onCommit(parsed);
		setDraft(null);
	};

	return (
		<Input
			aria-label={label}
			title={label}
			value={draft ?? formatCueTime({ seconds })}
			className="h-7 w-16 px-1.5 text-xs tabular-nums"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}
