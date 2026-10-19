import { useMemo, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeToSeconds, type MediaTime } from "@/wasm";
import { listSubtitleGroups, type SubtitleEntry } from "@/subtitles/groups";

function formatCueTime({ time }: { time: MediaTime }): string {
	const seconds = mediaTimeToSeconds({ time });
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

/** 자막 그룹 하나를 시간순 목록으로 보여 주고, 텍스트 수정과 해당 시점 이동을 한다 */
export function SubtitleListView() {
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const groups = useMemo(
		() => (scene ? listSubtitleGroups({ tracks: scene.tracks }) : []),
		[scene],
	);
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
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
						{group.entries.map((entry) => (
							<SubtitleRow key={entry.element.id} entry={entry} />
						))}
					</ol>
				</div>
			)}
		</PanelView>
	);
}

function SubtitleRow({ entry }: { entry: SubtitleEntry }) {
	const editor = useEditor();
	const { element, trackId } = entry;
	const content = String(element.params.content ?? "");
	const [draft, setDraft] = useState<string | null>(null);

	const commit = () => {
		if (draft === null) return;
		if (draft !== content) {
			editor.timeline.updateElements({
				updates: [{ trackId, elementId: element.id, patch: { params: { content: draft } } }],
			});
		}
		setDraft(null);
	};

	const jumpTo = () => {
		editor.playback.seek({ time: element.startTime });
		editor.selection.setSelectedElements({
			elements: [{ trackId, elementId: element.id }],
		});
	};

	return (
		<li className="flex gap-2">
			<button
				type="button"
				className="text-muted-foreground hover:text-foreground w-12 shrink-0 pt-1.5 text-left text-xs tabular-nums"
				aria-label={`Go to ${formatCueTime({ time: element.startTime })}`}
				onClick={jumpTo}
			>
				{formatCueTime({ time: element.startTime })}
			</button>
			<Textarea
				value={draft ?? content}
				rows={Math.max(1, (draft ?? content).split("\n").length)}
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
		</li>
	);
}
