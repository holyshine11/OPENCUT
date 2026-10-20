"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { AutocutCommand } from "@/commands/timeline/element";
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
import { collectSubtitleWords, sourceCutsToTimeline } from "../apply";
import { fitRate, proposeEditPoints, rateChoices } from "../edit-points";
import { type ReviewItem, useAutocutReviewStore } from "../review-store";
import settings from "../settings.json";
import { collectSpeechRanges, proposeSilenceCuts } from "../silence";

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });

/**
 * 클립 하나의 편집점을 찾아 검토 목록으로 보여 주고 고른 대로 적용한다.
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
	const updateItem = useAutocutReviewStore((state) => state.updateItem);
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
			const proposals = proposeEditPoints({
				motion,
				motionSeconds,
				speech,
				frameSeconds: 1 / frameRateToFloat(fps),
				settings,
			});
			// 클립 밖 제안은 목록에 올리지 않는다
			const inClip = proposals.filter(
				(proposal) => sourceCutsToTimeline({ element, cuts: [proposal], fps }).length > 0,
			);
			if (inClip.length === 0) {
				clearItems();
				toast(m.autocut.noEditPoints);
				return;
			}
			const rules = settings.editPoints;
			setItems({
				elementId: element.id,
				items: inClip.map((proposal) => ({
					...proposal,
					action: proposal.rate ? "speed" : "cut",
					rate:
						proposal.rate ??
						Math.max(rules.minRate, fitRate({ seconds: proposal.end - proposal.start, rules })),
				})),
			});
		} catch (error) {
			console.error("Finding edit points failed:", error);
			toast.error(m.autocut.failed);
		} finally {
			setRunning(null);
		}
	};

	const timelineRangeOf = (item: ReviewItem) => sourceCutsToTimeline({ element, cuts: [item], fps }).at(0);

	const playFrom = (item: ReviewItem) => {
		const range = timelineRangeOf(item);
		if (!range) return;
		const lead = mediaTimeFromSeconds({ seconds: 1 });
		editor.playback.seek({ time: range.start > lead ? subMediaTime({ a: range.start, b: lead }) : ZERO_MEDIA_TIME });
		editor.playback.play();
	};

	const edits = items.flatMap((item) => {
		if (item.action === "keep") return [];
		return sourceCutsToTimeline({
			element,
			cuts: [{ start: item.start, end: item.end, rate: item.action === "speed" ? item.rate : undefined }],
			fps,
		});
	});
	const from = seconds(element.duration);
	const to = edits.reduce((rest, edit) => {
		const length = seconds(edit.end) - seconds(edit.start);
		return rest - (edit.rate ? length - length / edit.rate : length);
	}, from);

	const applyEdits = () => {
		editor.command.execute({
			command: new AutocutCommand({
				mediaId: element.mediaId,
				ranges: edits,
				select: [{ trackId, elementId: element.id }],
			}),
		});
		clearItems();
		toast.success(m.autocut.editsApplied({ count: edits.length }));
	};

	const rates = rateChoices({ rules: settings.editPoints });

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
						<ul className="flex flex-col gap-2">
							{items.map((item) => {
								const range = timelineRangeOf(item);
								return (
									<li key={item.id} className="border-border flex flex-col gap-1.5 rounded-md border p-2">
										<div className="flex items-center justify-between gap-2 text-xs">
											<button
												type="button"
												className="hover:text-primary font-mono tabular-nums"
												aria-label={m.autocut.playFrom}
												title={m.autocut.playFrom}
												onClick={() => playFrom(item)}
											>
												{range
													? `${formatCueTime({ seconds: seconds(range.start) })}–${formatCueTime({ seconds: seconds(range.end) })}`
													: "–"}
											</button>
											<span className="text-muted-foreground truncate" title={item.note}>
												{item.reason === "static"
													? m.autocut.reasonStatic
													: item.reason === "retake"
														? m.autocut.reasonRetake
														: m.autocut.reasonProcess}
												{" · "}
												{(item.end - item.start).toFixed(1)}s
												{item.note ? ` · ${item.note}` : ""}
											</span>
										</div>
										<ToggleGroup
											type="single"
											size="sm"
											variant="outline"
											className="justify-start"
											value={item.action === "speed" ? `speed:${item.rate}` : item.action}
											onValueChange={(value) => {
												if (!value) return;
												if (value === "keep" || value === "cut") {
													updateItem({ id: item.id, patch: { action: value } });
													return;
												}
												updateItem({
													id: item.id,
													patch: { action: "speed", rate: Number(value.slice("speed:".length)) },
												});
											}}
										>
											<ToggleGroupItem value="keep" className="flex-1 text-xs">
												{m.autocut.keep}
											</ToggleGroupItem>
											<ToggleGroupItem value="cut" className="flex-1 text-xs">
												{m.autocut.cut}
											</ToggleGroupItem>
											{rates.map((rate) => (
												<ToggleGroupItem key={rate} value={`speed:${rate}`} className="flex-1 text-xs">
													{m.autocut.rate({ rate })}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</li>
								);
							})}
						</ul>
						<Button className="w-full" disabled={edits.length === 0} onClick={applyEdits}>
							{m.autocut.applyEdits({ count: edits.length, from: from.toFixed(1), to: to.toFixed(1) })}
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
