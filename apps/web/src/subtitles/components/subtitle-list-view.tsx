import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	Download01Icon,
	GitMergeIcon,
	ScissorIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
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
import { cn } from "@/utils/ui";
import { listSubtitleGroups, type SubtitleEntry } from "@/subtitles/groups";
import { formatCueTime, parseCueTime } from "@/subtitles/edit";
import { formatSrt } from "@/subtitles/srt";
import { downloadBuffer } from "@/export";
import {
	cueOf,
	mergeSubtitles,
	replaceAllInSubtitles,
	replaceInSubtitle,
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
	const [isFinding, setIsFinding] = useState(false);
	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [matchIndex, setMatchIndex] = useState(0);
	const editor = useEditor();
	const group =
		groups.find((candidate) => candidate.groupId === selectedGroupId) ??
		groups.at(-1);

	const matches =
		isFinding && query && group
			? group.entries.filter((entry) => cueOf({ entry }).text.includes(query))
			: [];
	const currentMatch = matches.length
		? matches[matchIndex % matches.length]
		: undefined;

	const goToMatch = (index: number) => {
		const target = matches.at(index % matches.length);
		if (!target) return;
		setMatchIndex((index + matches.length) % matches.length);
		setActiveId(target.element.id);
		editor.playback.seek({ time: target.element.startTime });
	};

	return (
		<PanelView
			title="Subtitle list"
			actions={
				group && (
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Export SRT"
							title="Export SRT"
							onClick={() => {
								const srt = formatSrt({
									cues: group.entries.map((entry) => {
										const cue = cueOf({ entry });
										return {
											text: cue.text,
											startTime: cue.start,
											duration: cue.end - cue.start,
										};
									}),
								});
								downloadBuffer({
									buffer: new TextEncoder().encode(srt).buffer,
									filename: `${editor.project.getActive().metadata.name}.srt`,
									mimeType: "application/x-subrip",
								});
							}}
						>
							<HugeiconsIcon icon={Download01Icon} size={16} />
						</Button>
						<Button
							type="button"
							variant={isFinding ? "secondary" : "ghost"}
							size="icon"
							aria-label="Find and replace"
							title="Find and replace"
							onClick={() => setIsFinding(!isFinding)}
						>
							<HugeiconsIcon icon={Search01Icon} size={16} />
						</Button>
					</div>
				)
			}
		>
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
					{isFinding && (
						<div className="flex flex-col gap-1.5 border-b pb-2">
							<div className="flex items-center gap-1">
								<Input
									aria-label="Find"
									placeholder="Find"
									value={query}
									className="h-8 text-sm"
									onChange={(event) => {
										setQuery(event.target.value);
										setMatchIndex(0);
									}}
									onKeyDown={(event) => {
										if (
											event.key === "Enter" &&
											!event.nativeEvent.isComposing
										) {
											goToMatch(matchIndex + (event.shiftKey ? -1 : 1));
										}
									}}
								/>
								<span className="text-muted-foreground w-12 shrink-0 text-center text-xs tabular-nums">
									{query
										? `${matches.length ? (matchIndex % matches.length) + 1 : 0}/${matches.length}`
										: ""}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Previous match"
									disabled={!matches.length}
									onClick={() => goToMatch(matchIndex - 1)}
								>
									<HugeiconsIcon icon={ArrowUp01Icon} size={14} />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Next match"
									disabled={!matches.length}
									onClick={() => goToMatch(matchIndex + 1)}
								>
									<HugeiconsIcon icon={ArrowDown01Icon} size={14} />
								</Button>
							</div>
							<div className="flex items-center gap-1">
								<Input
									aria-label="Replace with"
									placeholder="Replace with"
									value={replacement}
									className="h-8 text-sm"
									onChange={(event) => setReplacement(event.target.value)}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={!currentMatch}
									onClick={() =>
										currentMatch &&
										replaceInSubtitle({
											editor,
											entry: currentMatch,
											query,
											replacement,
										})
									}
								>
									Replace
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={!matches.length}
									onClick={() =>
										replaceAllInSubtitles({
											editor,
											entries: group.entries,
											query,
											replacement,
										})
									}
								>
									All
								</Button>
							</div>
						</div>
					)}
					<ol className="flex flex-col gap-1.5">
						{group.entries.map((entry, index) => (
							<SubtitleRow
								key={entry.element.id}
								entry={entry}
								previous={group.entries[index - 1]}
								next={group.entries[index + 1]}
								isActive={entry.element.id === activeId}
								isMatch={matches.includes(entry)}
								isCurrentMatch={entry === currentMatch}
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
	isMatch,
	isCurrentMatch,
	onActivate,
}: {
	entry: SubtitleEntry;
	previous: SubtitleEntry | undefined;
	next: SubtitleEntry | undefined;
	isActive: boolean;
	isMatch: boolean;
	isCurrentMatch: boolean;
	onActivate: () => void;
}) {
	const editor = useEditor();
	const { element, trackId } = entry;
	const cue = cueOf({ entry });
	const [draft, setDraft] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const rowRef = useRef<HTMLLIElement>(null);

	useEffect(() => {
		if (isCurrentMatch) rowRef.current?.scrollIntoView({ block: "nearest" });
	}, [isCurrentMatch]);

	const commit = () => {
		if (draft === null) return;
		if (draft !== cue.text) {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: { content: draft } },
					},
				],
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
		<li
			ref={rowRef}
			data-match={isMatch || undefined}
			className={cn(
				"flex flex-col gap-1 rounded-sm",
				isMatch && "bg-amber-500/10",
				isCurrentMatch && "ring-1 ring-amber-500",
			)}
		>
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
						if (
							event.key === "Enter" &&
							!event.shiftKey &&
							!event.nativeEvent.isComposing
						) {
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
							retimeSubtitle({
								editor,
								entry,
								start,
								end: cue.end,
								previous,
								next,
							})
						}
					/>
					<CueTimeInput
						label="End"
						seconds={cue.end}
						onCommit={(end) =>
							retimeSubtitle({
								editor,
								entry,
								start: cue.start,
								end,
								previous,
								next,
							})
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
						onClick={() =>
							next && mergeSubtitles({ editor, first: entry, second: next })
						}
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
