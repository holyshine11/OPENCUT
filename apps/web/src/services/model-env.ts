import settings from "@/transcription/settings.json";
import { env } from "@huggingface/transformers";

// 브라우저 worker에서 모델을 앱 폴더(public/)에서만 읽게 한다. worker 맨 위에서 한 번 부른다.
// - Turbopack이 만든 worker는 blob: URL에서 돌아 "/models/" 같은 경로를 혼자 못 푼다. 로컬 경로에 origin을 붙여도 로컬 파일로 본다
// - onnxruntime wasm도 CDN 대신 앱 폴더(public/ort)에서 읽고, 앱 폴더가 곧 저장소라 Cache Storage에 복사하지 않는다

const origin = () => self.location.origin;

export function readTranscriptionModelsFromAppFolder() {
	env.allowLocalModels = true;
	env.allowRemoteModels = false;
	env.useBrowserCache = false;
	env.localModelPath = new URL(settings.local.modelPath, origin()).href;
	if (env.backends.onnx.wasm) {
		env.backends.onnx.wasm.wasmPaths = new URL(settings.local.ortPath, origin()).href;
	}
}
