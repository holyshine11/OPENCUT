import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	applyTextStyleToElements,
	getSelectedTextStyle,
} from "@/text/apply-style";
import {
	useTextStylePresets,
	type TextStylePreset,
} from "@/text/style-presets";
import { useMessages } from "@/i18n";

/** 텍스트 탭의 "내 스타일". 선택한 텍스트 스타일을 저장하고, 선택한 텍스트들에 한꺼번에 적용한다 */
export function StylePresetsSection() {
	const editor = useEditor();
	const m = useMessages();
	const { selectedElements } = useElementSelection();
	const presets = useTextStylePresets((state) => state.presets);
	const selectedStyle = getSelectedTextStyle({
		editor,
		elements: selectedElements,
	});

	return (
		<section className="flex flex-col gap-2 border-t px-3 pt-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">{m.textPanel.myStyles}</h3>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!selectedStyle}
					onClick={() =>
						selectedStyle &&
						useTextStylePresets
							.getState()
							.add({ name: "", style: selectedStyle })
					}
				>
					{m.textPanel.saveSelectedStyle}
				</Button>
			</div>
			{presets.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{m.textPanel.noStylesHint}
				</p>
			) : (
				<>
					<p className="text-muted-foreground text-xs">
						{selectedStyle
							? m.textPanel.applyHint
							: m.textPanel.selectToApplyHint}
					</p>
					<ul className="flex flex-col gap-1">
						{presets.map((preset) => (
							<PresetRow
								key={preset.id}
								preset={preset}
								canApply={Boolean(selectedStyle)}
								onApply={() =>
									applyTextStyleToElements({
										editor,
										elements: selectedElements,
										style: preset.style,
									})
								}
							/>
						))}
					</ul>
				</>
			)}
		</section>
	);
}

function PresetRow({
	preset,
	canApply,
	onApply,
}: {
	preset: TextStylePreset;
	canApply: boolean;
	onApply: () => void;
}) {
	const m = useMessages();
	const [draftName, setDraftName] = useState<string | null>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const isRenaming = draftName !== null;
	useEffect(() => {
		if (isRenaming) nameInputRef.current?.select();
	}, [isRenaming]);
	const { rename, remove } = useTextStylePresets.getState();
	const color =
		typeof preset.style.color === "string" ? preset.style.color : undefined;
	const fontFamily =
		typeof preset.style.fontFamily === "string"
			? preset.style.fontFamily
			: undefined;

	if (draftName !== null) {
		const commit = () => {
			rename({ id: preset.id, name: draftName });
			setDraftName(null);
		};
		return (
			<li>
				<Input
					ref={nameInputRef}
					aria-label={m.textPanel.styleName}
					value={draftName}
					className="h-8 text-sm"
					onChange={(event) => setDraftName(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing)
							commit();
						if (event.key === "Escape") setDraftName(null);
					}}
				/>
			</li>
		);
	}

	return (
		<li className="flex items-center gap-1">
			<Button
				type="button"
				variant="ghost"
				className="h-8 flex-1 justify-start truncate px-2"
				disabled={!canApply}
				onClick={onApply}
			>
				<span
					className="bg-muted mr-1 rounded px-1.5 text-sm"
					style={{ color, fontFamily }}
					aria-hidden
				>
					Aa
				</span>
				{preset.name}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={m.textPanel.renameStyle({ name: preset.name })}
				onClick={() => setDraftName(preset.name)}
			>
				<HugeiconsIcon icon={PencilEdit01Icon} size={14} />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={m.textPanel.deleteStyle({ name: preset.name })}
				onClick={() => remove({ id: preset.id })}
			>
				<HugeiconsIcon icon={Delete02Icon} size={14} />
			</Button>
		</li>
	);
}
