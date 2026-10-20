"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { AutocutCommand, SplitAtTimesCommand } from "@/commands/timeline/element";
import { useEditor } from "@/editor/use-editor";
import { frameRateToFloat } from "@/fps/utils";
import { useMessages } from "@/i18n";
import { formatCueTime } from "@/subtitles/edit";
import type { VideoElement } from "@/timeline";
import {
	type MediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { getMotionAnalysis, getSpeechAnalysis } from "../analysis";
import { collectSubtitleWords, sourceCutsToTimeline, sourcePointsToTimeline } from "../apply";
import { type EditPoint, proposeEditPoints } from "../edit-points";
import { useAutocutReviewStore } from "../review-store";
import settings from "../settings.json";
import { collectSpeechRanges, proposeSilenceCuts } from "../silence";

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });

/**
 * 클립 하나의 편집점을 찾아 목록으로 보여 주고, 고른 지점에서 클립을 쪼개기만 한다. 자르거나 빠르게 넘길지는 사람이 정한다.
 * 무음 자동 컷은 검토 없이 바로 잘라 낸다
 */
export function AutocutTab({ element, trackId }: { element: VideoElement; trackId: string }) {
	const editor = useEditor();
	const m = useMessages();
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const [running, setRunning] = useState<{ action: "silence" | "editPoints"; label: string } | null>(null);
	const reviewElementId = useAutocutReviewStore((state) => state.elementId);
	const allItems = useAutocutReviewStore((state) => state.items);
	const setItems = useAutocutReviewStore((state) => state.setItems);
	const setEnabled = useAutocutReviewStore((state) => state.setEnabled);
	const clearItems = useAutocutReviewStore((state) => state.clear);
	const items = reviewElementId === element.id ? allItems : [];

	const findAsset = () => editor.media.getAssets().find((item) => item.id === element.mediaId);
	const subtitleWords = () =>
		collectSubtitleWords({ tracks: editor.scenes.getActiveScene().tracks, element });

	const cutSilences = async () => {
		const asset = findAsset();
		if (!asset || asset.hasAudio === false) {
			toast.error(m.autocut.noAudio);
			return;
		}
		const showProgress = (percent: number) =>
			setRunning({ action: "silence", label: m.autocut.analyzing({ percent }) });
		showProgress(0);
		try {
			const analysis = await getSpeechAnalysis({ asset, onProgress: showProgress });
			const ranges = sourceCutsToTimeline({
				element,
				cuts: proposeSilenceCuts({
					...analysis,
					words: subtitleWords(),
					frameSeconds: 1 / frameRateToFloat(fps),
					settings,
				}),
				fps,
			});
			if (ranges.length === 0) {
				toast(m.autocut.nothingToCut);
				return;
			}
			editor.command.execute({
				command: new AutocutCommand({
					mediaId: element.mediaId,
					ranges,
					select: [{ trackId, elementId: element.id }],
				}),
			});
			clearItems();
			const removed = ranges.reduce((sum, range) => sum + seconds(range.end) - seconds(range.start), 0);
			toast.success(m.autocut.done({ count: ranges.length, seconds: removed.toFixed(1) }));
		} catch (error) {
			console.error("Auto cut failed:", error);
			toast.error(m.autocut.failed);
		} finally {
			setRunning(null);
		}
	};

	const findEditPoints = async () => {
		const asset = findAsset();
		if (!asset) {
			toast.error(m.autocut.failed);
			return;
		}
		setRunning({ action: "editPoints", label: m.autocut.analyzing({ percent: 0 }) });
		try {
			const words = subtitleWords();
			const speech =
				asset.hasAudio === false
					? words
					: collectSpeechRanges({
							...(await getSpeechAnalysis({
								asset,
								onProgress: (percent) =>
									setRunning({ action: "editPoints", label: m.autocut.analyzing({ percent }) }),
							})),
							words,
							settings,
						});
			const { motion, motionSeconds } = await getMotionAnalysis({
				asset,
				onProgress: (percent) =>
					setRunning({ action: "editPoints", label: m.autocut.analyzingVideo({ percent }) }),
			});
			const points = proposeEditPoints({
				motion,
				motionSeconds,
				speech,
				frameSeconds: 1 / frameRateToFloat(fps),
				settings,
			});
			// 클립 밖 지점은 목록에 올리지 않는다
			const inClip = points.filter(
				(point) => sourcePointsToTimeline({ element, points: [point], fps }).length > 0,
			);
			if (inClip.length === 0) {
				clearItems();
				toast(m.autocut.noEditPoints);
				return;
			}
			setItems({ elementId: element.id, items: inClip });
		} catch (error) {
			console.error("Finding edit points failed:", error);
			toast.error(m.autocut.failed);
		} finally {
			setRunning(null);
		}
	};

	const timelineTimeOf = (item: EditPoint) => sourcePointsToTimeline({ element, points: [item], fps }).at(0)?.time;

	const playFrom = (item: EditPoint) => {
		const time = timelineTimeOf(item);
		if (time === undefined) return;
		const lead = mediaTimeFromSeconds({ seconds: 1 });
		editor.playback.seek({ time: time > lead ? subMediaTime({ a: time, b: lead }) : ZERO_MEDIA_TIME });
		editor.playback.play();
	};

	const times = sourcePointsToTimeline({ element, points: items.filter((item) => item.enabled), fps }).map(
		(point) => point.time,
	);

	const splitAtPoints = () => {
		editor.command.execute({
			command: new SplitAtTimesCommand({
				mediaId: element.mediaId,
				times,
				select: [{ trackId, elementId: element.id }],
			}),
		});
		clearItems();
		toast.success(m.autocut.splitDone({ count: times.length }));
	};

	const reasonLabel: Record<EditPoint["reason"], string> = {
		speechStart: m.autocut.reasonSpeechStart,
		speechEnd: m.autocut.reasonSpeechEnd,
		motionStart: m.autocut.reasonMotionStart,
		motionStop: m.autocut.reasonMotionStop,
		event: m.autocut.reasonEvent,
	};

	return (
		<Section sectionKey={`${element.id}:autocut`}>
			<SectionHeader>
				<SectionTitle>{m.autocut.title}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<p className="text-muted-foreground mb-3 text-xs">{m.autocut.editPointsHint}</p>
				<Button className="mb-3 w-full" disabled={running !== null} onClick={findEditPoints}>
					{running?.action === "editPoints" ? running.label : m.autocut.findEditPoints}
				</Button>

				{items.length > 0 && (
					<div className="mb-4 flex flex-col gap-2">
						<ul className="flex flex-col gap-1">
							{items.map((item) => {
								const time = timelineTimeOf(item);
								return (
									<li key={item.id} className="flex items-center gap-2 text-xs">
										<Checkbox
											checked={item.enabled}
											aria-label={reasonLabel[item.reason]}
											onCheckedChange={(checked) => setEnabled({ id: item.id, enabled: checked === true })}
										/>
										<button
											type="button"
											className="hover:text-primary font-mono tabular-nums"
											aria-label={m.autocut.playFrom}
											title={m.autocut.playFrom}
											onClick={() => playFrom(item)}
										>
											{time === undefined ? "–" : formatCueTime({ seconds: seconds(time) })}
										</button>
										<span className="text-muted-foreground truncate">{reasonLabel[item.reason]}</span>
									</li>
								);
							})}
						</ul>
						<Button className="w-full" disabled={times.length === 0} onClick={splitAtPoints}>
							{m.autocut.splitAt({ count: times.length })}
						</Button>
						<Button className="w-full" variant="ghost" size="sm" onClick={clearItems}>
							{m.autocut.clearEdits}
						</Button>
					</div>
				)}

				<p className="text-muted-foreground mb-3 text-xs">{m.autocut.hint}</p>
				<Button className="w-full" variant="secondary" disabled={running !== null} onClick={cutSilences}>
					{running?.action === "silence" ? running.label : m.autocut.run}
				</Button>
			</SectionContent>
		</Section>
	);
}
