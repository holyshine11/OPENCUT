import { Command, type CommandResult } from "@/commands/base-command";
import type { TScene } from "@/timeline";
import { EditorCore } from "@/core";
import { updateSceneInArray } from "@/timeline/scenes";

/** 활성 장면의 트랙 폴더와 구성원 트랙을 함께 바꾼다 */
export class UpdateTrackFoldersCommand extends Command {
	private savedScenes: TScene[] | null = null;

	constructor(
		private readonly update: (
			scene: TScene,
		) => Pick<TScene, "tracks" | "trackFolders">,
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveScene();
		const scenes = editor.scenes.getScenes();
		this.savedScenes = scenes;

		editor.scenes.setScenes({
			scenes: updateSceneInArray({
				scenes,
				sceneId: scene.id,
				updates: this.update(scene),
			}),
		});
		return undefined;
	}

	undo(): void {
		if (this.savedScenes) {
			EditorCore.getInstance().scenes.setScenes({ scenes: this.savedScenes });
		}
	}
}
