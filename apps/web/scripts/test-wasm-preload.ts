import { plugin } from "bun";

// bun test는 wasm-bindgen bundler 타깃의 `import * as wasm from "*_bg.wasm"`을
// WASI 모듈로 읽어 `__wbindgen_start`가 없다. 테스트에서만 wasm을 직접 인스턴스화해 넘긴다.
plugin({
	name: "wasm-bindgen-bundler",
	setup(build) {
		build.onLoad({ filter: /_bg\.wasm$/ }, ({ path }) => {
			const mod = new WebAssembly.Module(require("node:fs").readFileSync(path));
			const importModules = [
				...new Set(WebAssembly.Module.imports(mod).map((i) => i.module)),
			];
			const exportNames = WebAssembly.Module.exports(mod).map((e) => e.name);
			const contents = [
				`import { readFileSync } from "node:fs";`,
				...importModules.map(
					(m, i) => `import * as m${i} from ${JSON.stringify(m)};`,
				),
				`const instance = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(${JSON.stringify(path)})), {${importModules
					.map((m, i) => `${JSON.stringify(m)}: m${i}`)
					.join(", ")}});`,
				...exportNames.map(
					(n) => `export const ${n} = instance.exports[${JSON.stringify(n)}];`,
				),
			].join("\n");
			return { contents, loader: "js" };
		});
	},
});
