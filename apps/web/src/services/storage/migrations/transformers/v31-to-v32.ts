import { fromLegacySceneTracks } from "@/timeline/legacy-tracks";
import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId, isRecord } from "./utils";

/**
 * 메인 트랙을 없애고 트랙을 위→아래 한 줄 목록(trackList)으로 둔다.
 * 옛 tracks는 지우지 않고 그대로 남긴다(마이그레이션은 덧붙이기만 한다)
 */
export function transformProjectV31ToV32({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	if (!getProjectId({ project })) {
		return { project, skipped: true, reason: "no project id" };
	}

	const version = project.version;
	if (typeof version !== "number") {
		return { project, skipped: true, reason: "invalid version" };
	}
	if (version >= 32) {
		return { project, skipped: true, reason: "already v32" };
	}
	if (version !== 31) {
		return { project, skipped: true, reason: "not v31" };
	}

	return {
		project: {
			...project,
			...(Array.isArray(project.scenes)
				? { scenes: project.scenes.map((scene) => migrateScene({ scene })) }
				: {}),
			version: 32,
		},
		skipped: false,
	};
}

function migrateScene({ scene }: { scene: unknown }): unknown {
	if (!isRecord(scene) || Array.isArray(scene.trackList)) {
		return scene;
	}

	return {
		...scene,
		trackList: fromLegacySceneTracks({ tracks: scene.tracks }),
	};
}
