// 음성 인식 모델과 onnxruntime wasm을 앱 폴더(public/)에 받아 둔다. 한 번 받아 두면 앱은 인터넷 없이 돌아간다.
//
// 사용: bun run models   (apps/web 에서)
// 받을 파일은 transcription/settings.json(model, vad, local)에서 정한다. 이미 있는 파일은 건너뛰고,
// 받다 만 파일은 .part 로 남아 있다가 다시 실행하면 처음부터 다시 받는다
import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { env } from "@huggingface/transformers";
import settings from "@/transcription/settings.json";

const publicDir = resolve(import.meta.dir, "../public");
const modelDir = join(publicDir, settings.local.modelPath);
const ortDir = join(publicDir, settings.local.ortPath);
// transformers.js 가 의존하는 onnxruntime-web 의 wasm 을 쓴다.
// 격리 설치라 최상위 node_modules 에 다른 버전이 있을 수 있어 패키지 폴더에서부터 찾는다
function ortDist(): string {
	const pkgDir = dirname(createRequire(import.meta.url).resolve("@huggingface/transformers/package.json"));
	return join(dirname(createRequire(join(pkgDir, "package.json")).resolve("onnxruntime-web/package.json")), "dist");
}

/** transformers.js 가 dtype 별로 찾는 onnx 파일 이름 */
const dtypeSuffix = ({ dtype }: { dtype: string }) => (dtype === "fp32" ? "" : `_${dtype}`);

const modelFiles = [
	...settings.local.modelFiles.map((file) => ({ id: settings.model.huggingFaceId, file })),
	...Object.entries(settings.model.dtype).map(([name, dtype]) => ({
		id: settings.model.huggingFaceId,
		file: `onnx/${name}${dtypeSuffix({ dtype })}.onnx`,
	})),
	{ id: settings.vad.huggingFaceId, file: `onnx/model${dtypeSuffix({ dtype: settings.vad.dtype })}.onnx` },
];

async function sizeOf({ path }: { path: string }): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch {
		return 0;
	}
}

async function download({ id, file }: { id: string; file: string }) {
	const target = join(modelDir, id, file);
	if ((await sizeOf({ path: target })) > 0) {
		console.log(`있음  ${id}/${file}`);
		return;
	}
	const url = `${env.remoteHost}${env.remotePathTemplate.replace("{model}", id).replace("{revision}", "main")}${file}`;
	const response = await fetch(url);
	if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
	await mkdir(dirname(target), { recursive: true });
	const part = `${target}.part`;
	await Bun.write(part, response);
	await rename(part, target);
	console.log(`받음  ${id}/${file} (${((await sizeOf({ path: target })) / 1e6).toFixed(1)} MB)`);
}

async function copyOrt({ file }: { file: string }) {
	const target = join(ortDir, file);
	const source = join(ortDist(), file);
	// 라이브러리를 올리면 같은 이름으로 내용이 바뀌므로 크기로 견준다
	if ((await sizeOf({ path: target })) === (await sizeOf({ path: source }))) {
		console.log(`있음  ort/${file}`);
		return;
	}
	await mkdir(ortDir, { recursive: true });
	await copyFile(source, target);
	console.log(`복사  ort/${file}`);
}

for (const file of settings.local.ortFiles) await copyOrt({ file });
for (const entry of modelFiles) await download(entry);
console.log(`완료: ${modelDir}`);
