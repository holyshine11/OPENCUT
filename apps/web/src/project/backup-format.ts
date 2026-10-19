import type {
	MediaAssetData,
	SerializedProject,
} from "@/services/storage/types";
import type { ZipEntry } from "@/utils/zip";

// 백업 .zip 안의 구성. 형식을 바꾸면 BACKUP_FORMAT을 올리고 읽는 쪽에서 옛 형식을 처리한다
const BACKUP_FORMAT = 1;
const MANIFEST = "backup.json";

export interface BackupMedia {
	metadata: MediaAssetData;
	file: File;
}

export interface ProjectBackup {
	project: SerializedProject;
	media: BackupMedia[];
}

export function packBackup({ project, media }: ProjectBackup): ZipEntry[] {
	return [
		{
			name: MANIFEST,
			data: new Blob([JSON.stringify({ format: BACKUP_FORMAT, project })]),
		},
		...media.flatMap(({ metadata, file }) => [
			{
				name: `media/${metadata.id}.json`,
				data: new Blob([JSON.stringify({ metadata, fileType: file.type })]),
			},
			{ name: `media/${metadata.id}.bin`, data: file },
		]),
	];
}

export async function unpackBackup({
	entries,
}: {
	entries: ZipEntry[];
}): Promise<ProjectBackup> {
	// 압축을 풀었다가 폴더째 다시 압축하면 모든 이름 앞에 폴더가 붙고 macOS 부가 파일이 섞인다
	const files = entries.filter(({ name }) => !name.startsWith("__MACOSX/"));
	const manifestName = files.find(
		({ name }) => name === MANIFEST || name.endsWith(`/${MANIFEST}`),
	)?.name;
	const prefix = manifestName?.slice(0, -MANIFEST.length) ?? "";
	const byName = new Map(
		files
			.filter(({ name }) => name.startsWith(prefix))
			.map((entry) => [entry.name.slice(prefix.length), entry.data]),
	);
	const manifest = byName.get(MANIFEST);
	if (!manifest) throw new Error("Not an OpenCut project backup");
	const { format, project } = JSON.parse(await manifest.text());
	if (format !== BACKUP_FORMAT || !project?.metadata?.id) {
		throw new Error("Unsupported backup format");
	}

	const media: BackupMedia[] = [];
	for (const [name, data] of byName) {
		const id = name.match(/^media\/(.+)\.json$/)?.[1];
		const content = id && byName.get(`media/${id}.bin`);
		if (!content) continue;
		const { metadata, fileType } = JSON.parse(await data.text());
		media.push({
			metadata,
			file: new File([content], metadata.name, {
				type: fileType,
				lastModified: metadata.lastModified,
			}),
		});
	}

	return { project, media };
}

/** 같은 id의 프로젝트가 이미 있으면 덮어쓰지 않도록 새 id와 사본 이름을 붙인다 */
export function renameIfTaken({
	project,
	takenIds,
	newId,
	copyName,
}: {
	project: SerializedProject;
	takenIds: ReadonlySet<string>;
	newId: string;
	copyName: string;
}): SerializedProject {
	if (!takenIds.has(project.metadata.id)) return project;
	return {
		...project,
		metadata: { ...project.metadata, id: newId, name: copyName },
	};
}
