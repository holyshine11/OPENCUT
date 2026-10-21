# OpenCut (개인 포크)

[opencut-app/opencut-classic](https://github.com/opencut-app/opencut-classic)을 기반으로 한 로컬 전용 영상 편집기. 프로젝트와 미디어는 브라우저 저장소(IndexedDB/OPFS)에만 저장해서 서버 DB가 필요 없다.

## 새 맥에 설치하기 (M1 포함)

처음 한 번만 하면 된다. 인터넷이 필요하고 디스크 여유가 20GB쯤 있어야 한다(대본 읽기 엔진만 12GB). 아래 명령은 Orca 터미널이나 macOS 기본 터미널 앱에 한 줄씩 붙여 넣고 Enter를 누른다.

### 1. Homebrew 설치

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

맥 로그인 비밀번호를 물으면 입력한다(입력해도 화면에 안 보이는 게 정상). `git`이 없다고 Command Line Tools 설치 창이 뜨면 설치하고 이 명령을 다시 실행한다. 끝나면 아래 줄로 `brew` 명령을 쓸 수 있게 한다.

```sh
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. GitHub 로그인

저장소를 비공개로 바꾼 뒤에도 업데이트를 받고, 비공개 목소리 묶음(`holyshine11/OPENCUT-voices`)을 받으려면 로그인이 필요하다.

```sh
brew install gh
gh auth login --web --git-protocol https
gh auth setup-git
```

`gh auth login`은 화면에 코드를 보여 주고 브라우저를 연다. 그 코드를 넣고 로그인한다. 로그인하는 계정은 `holyshine11`이거나, 두 저장소(`OPENCUT`, `OPENCUT-voices`)에 협업자로 초대받은 계정이어야 한다.

### 3. 코드 받기

Orca에서 저장소 추가(클론)를 고르고 아래 주소를 붙여 넣는다.

```
https://github.com/holyshine11/OPENCUT.git
```

터미널로 받으려면:

```sh
git clone https://github.com/holyshine11/OPENCUT.git ~/OPENCUT
```

이 아래 명령은 모두 받은 폴더 안에서 실행한다. Orca 터미널은 보통 이미 그 폴더에서 열린다. 기본 터미널이면 `cd ~/OPENCUT`부터 한다.

### 4. 대본 읽기(TTS) 설치

```sh
apps/tts/setup-mac.sh
```

엔진, 파이썬 패키지, 모델, 목소리 묶음을 받고 마지막에 목소리마다 한 문장씩 합성해 본다. 처음엔 30분 넘게 걸릴 수 있다. 중간에 끊겨도 다시 실행하면 받은 것은 건너뛰고 이어서 한다. 대본 읽기를 안 쓸 거면 이 단계는 건너뛰어도 편집기는 돈다.

### 5. 실행

```sh
./start-mac.command
```

Finder에서 `start-mac.command`를 더블클릭해도 된다. 처음엔 Bun 설치, 받아쓰기 모델(약 1.5GB) 다운로드, 빌드로 몇 분 걸리고 준비되면 브라우저가 `http://localhost:3000`을 연다.

## 매일 쓰기

`./start-mac.command`를 실행하거나 더블클릭한다. 실행할 때마다 최신 코드를 받아서 바뀐 게 있을 때만 다시 빌드한다. 인터넷이 없으면 "업데이트 실패" 문구가 나오고 기존 버전으로 그대로 뜬다. 끄려면 그 터미널 창에서 `Ctrl+C`를 누른다. 대본 읽기 서버도 같이 꺼진다.

## 문제가 생기면

- 업데이트가 계속 실패한다(인터넷은 되는데): `gh auth status`로 로그인을 확인하고, 풀려 있으면 2단계를 다시 한다.
- 대본 읽기가 안 된다: `apps/tts/setup-mac.sh`를 다시 실행한다. 로그는 `apps/tts/tts-web.log`, `apps/tts/tts-server.log`에 남는다.
- 받아쓰기가 안 된다: 인터넷을 켜고 `bun run --cwd apps/web models`로 모델을 다시 받는다.
- 목소리가 새로 나왔다: `apps/tts/setup-mac.sh`를 다시 실행하면 최신 묶음만 받는다.

## 개발

```sh
bun install
bun dev:web   # http://localhost:3000
```

환경 변수, DB, Redis 없이 동작한다. 로그인·블로그·효과음 검색(Freesound)은 로컬 전용으로 바꾸면서 제거했다. 요구사항은 `docs/requirements/local-capcut.md`를 본다.

upstream 변경 받기: `git fetch upstream && git merge upstream/main`

---

# OpenCut (Legacy)

This is the original OpenCut codebase. It's archived and no longer maintained.

The rewrite is happening at [opencut-app/opencut](https://github.com/opencut-app/opencut).

## Sponsors

Thanks to [Vercel](https://vercel.com?utm_source=github-opencut&utm_campaign=oss) and [fal.ai](https://fal.ai?utm_source=github-opencut&utm_campaign=oss) for their support of open-source software.

<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

<a href="https://fal.ai">
  <img alt="Powered by fal.ai" src="https://img.shields.io/badge/Powered%20by-fal.ai-000000?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCAxMEwxMy4wOSAxNS43NEwxMiAyMkwxMC45MSAxNS43NEw0IDEwTDEwLjkxIDguMjZMMTIgMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=" />
</a>

## Why?

- **Privacy**: Your videos stay on your device
- **Free features**: Most basic CapCut features are now paywalled 
- **Simple**: People want editors that are easy to use - CapCut proved that

## Project Structure

- `apps/web/`: Next.js web application
- `apps/desktop/`: Native desktop app built with GPUI (in progress)
- `rust/`: Platform-agnostic core: GPU compositor, effects, masks, and WASM bindings. We're actively migrating business logic here from TypeScript.
- `docs/`: Architecture and subsystem documentation

## Getting Started

### Setup

```bash
bun install
bun dev:web
```

The application will be available at [http://localhost:3000](http://localhost:3000). No environment variables or services are required.

### Desktop setup

Desktop is opt-in. If you're only working on the web app, skip this entirely.

If you want to get ready for `apps/desktop`, see [`apps/desktop/README.md`](apps/desktop/README.md). It's a two-step setup: Rust toolchain first, then desktop native dependencies.

### Local WASM development

Only needed if you're editing `rust/wasm` and want the web app to use your local build instead of the published package.

**Prerequisites** — install these once before anything else:

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# build the WASM package
cargo install wasm-pack

# reruns the build on file changes, used by bun dev:wasm
cargo install cargo-watch
```

1. Build the package once from the repo root:

   ```bash
   bun run build:wasm
   ```

2. Register the generated package for linking:

   ```bash
   cd rust/wasm/pkg
   bun link
   ```

3. Link `apps/web` to the local package:

   ```bash
   cd apps/web
   bun link opencut-wasm
   ```

4. Rebuild on changes while you work:

   ```bash
   bun dev:wasm
   ```

To switch `apps/web` back to the published package, run:

```bash
cd apps/web
bun add opencut-wasm
```

## Contributing

We welcome contributions! While we're actively developing and refactoring certain areas, there are plenty of opportunities to contribute effectively.

**🎯 Focus areas:** Timeline functionality, project management, performance, bug fixes, and UI improvements outside the preview panel.

**⚠️ Avoid for now:** Preview panel enhancements (fonts, stickers, effects) and export functionality - we're refactoring these with a new binary rendering approach.

See our [Contributing Guide](.github/CONTRIBUTING.md) for detailed setup instructions, development guidelines, and complete focus area guidance.

**Quick start for contributors:**

- Fork the repo and clone locally
- Follow the setup instructions in CONTRIBUTING.md
- Working on `apps/desktop`? See [`apps/desktop/README.md`](apps/desktop/README.md) for setup
- Create a feature branch and submit a PR

## License

[MIT LICENSE](LICENSE)

---

![Star History Chart](https://api.star-history.com/svg?repos=opencut-app/opencut&type=Date)

