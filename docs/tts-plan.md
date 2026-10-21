# 대본 읽기(TTS) + 자막 구현 계획

작성일 2026-10-21.

대본을 붙여 넣고 목소리(송이, 송강)를 고르면 문장마다 음성 클립과 자막이 타임라인에 함께 들어간다. 음성은 이미 만들어 둔 TTS 저장소(`/Users/Dev/TTS`, GitHub `holyshine11/TTS_TEST`, 비공개)의 합성 서버가 만들고, OPENCUT은 HTTP로 요청만 보낸다. 최종 사용처는 아내의 M1 16GB 맥북이고 인터넷 없이 돌아가야 한다.

## 1. 지금 있는 것

### TTS 저장소

| 구성 | 내용 |
|---|---|
| 합성 엔진 | GPT-SoVITS v2ProPlus (`GPT-SoVITS/`, upstream 48b1a01 + 로컬 수정 `patches/gpt-sovits.patch`, 12GB) |
| 합성 서버 | `api_v2.py` 하나(9880). 목소리를 바꾸면 가중치만 갈아 끼운다 (`tts-server.sh`, `tts-voices.json`) |
| 웹 서버 | `tts-web.py` 7860. `GET /voices`, `GET /config`, `POST /synth` |
| 목소리 데이터 | 참조 음성 `*_ref*.wav`, 보조 참조 `*_aux*.wav`, 말투 클립 `style_*`, 가중치 `GPT_weights_v2ProPlus/*.ckpt`(155MB), `SoVITS_weights_v2ProPlus/*.pth`(173MB) |
| 학습 | `train.sh` + `train-*.env` (slice → asr → format → sovits → gpt) |

`POST /synth`는 이미 쓸 만한 계약이다. text, voice, style, speed(0.8~1.2), pause(0~1.5초), question(물음표 끝음), strength(감정 강도), expressiveness(표현력), format(mp3·m4a)을 받아 후처리(잡음 제거, -16 LUFS, 송강은 울림 제거)까지 끝난 오디오를 돌려준다. 프리셋 5개(일반, 나레이션, 뉴스, 광고, 친근한 대화)는 `/config`로 받는다.

실측(2026-10-21, 개발 맥 M5 32GB, CPU 합성): 7.2초짜리 두 문장을 송이 5.1초, 송강 7.6초에 만들었다. 메모리는 송이 서버 2.7GB, 송강 서버 3.0GB, `tts-web.py` 4.4GB로 합계 약 10GB다. `tts-web.py`가 컸던 이유는 UVR5가 한 번 돌 때 6GB를 잡고 놓지 않아서였다(3단계에서 확인).

3단계 뒤(같은 날, footprint): 쉴 때 2.7GB, 두 목소리를 번갈아 쓴 뒤 3.3GB다. 송강 문장을 만드는 몇 초 동안은 울림 제거 프로세스 때문에 최대 6.6GB까지 오른다. 목소리 전환은 약 0.5초 걸린다.

### OPENCUT

새로 만들 필요 없이 이어 붙이면 되는 코드:

- **오디오 → 미디어 → 타임라인**: 효과음 라이브러리(`sounds/sound-library.ts` `importSoundAsMedia`)가 오디오를 받아 `processMediaAssets` → `editor.media.addMediaAsset` → `editor.timeline.insertElement`로 넣는다. TTS 결과도 같은 길로 넣는다.
- **자막 묶음 생성**: `transcription/caption.ts` `buildCaptionChunks`가 구간(text, start, end)을 자막 레이아웃(숏폼 12자, 롱폼 24자)에 맞춰 자른다. 단어 시간이 없으면 글자 수 비율로 나눈다. `subtitles/insert.ts` `insertCaptionChunksAsTextTrack`이 자막 트랙 하나를 `BatchCommand`로 넣는다.
- **자막 목록 패널**과 SRT·ASS 내보내기: 만든 자막은 일반 자막과 똑같이 고치고 내보낼 수 있다.
- **패널 탭**: `components/editor/panels/assets/assets-panel-store.tsx` `TAB_KEYS`에 탭을 하나 더하면 된다.

막히는 곳은 하나다. 브라우저(localhost:3000)가 7860에 바로 요청하면 CORS에 걸린다. `tts-web.py`는 CORS 헤더를 보내지 않는다.

## 2. CapCut에서 가져올 것과 버릴 것

CapCut의 텍스트 읽기는 텍스트 클립을 고르고 목소리를 누르면 그 클립 시작 위치에 음성이 붙고 텍스트 클립 길이가 음성 길이에 맞춰지는 방식이다. 글자를 고치면 음성을 다시 만들라는 표시가 뜨고, 여러 클립에 한 번에 적용할 수 있다.

가져올 것:

- 문장 단위로 음성 클립과 자막을 짝지어 만든다. 자막 길이는 음성 길이와 같다.
- 문장 하나만 다시 만들기. 글자를 고치면 그 문장의 음성이 낡았다고 표시한다.
- 이미 있는 자막(텍스트 클립)을 골라 읽히기.
- 목소리 미리 듣기.

이 앱이 CapCut보다 나은 점은 목소리가 직접 학습시킨 실제 사람 목소리라는 것, 그리고 같은 문장을 여러 번 만들어 고를 수 있다는 것(테이크, 서버에 `max_takes` 10이 이미 있다)이다.

버릴 것: 음성 변조(로봇, 다람쥐 같은 효과), 클라우드 목소리 목록, 노래 부르기. 요리 영상 내레이션에 쓰지 않는다.

## 3. 구조 결정

### 3-1. TTS는 별도 저장소에 둔다

OPENCUT은 공개 저장소(`holyshine11/OPENCUT`, PUBLIC)이고 TTS 저장소는 비공개다. 목소리 데이터는 실제 사람 목소리라 공개 저장소에 절대 들어가면 안 된다. 합성 엔진도 파이썬 + PyTorch 12GB라 Next.js 앱과 섞을 이유가 없다. `AGENTS.md`의 "로직은 `rust/`로"는 편집기 로직 이야기이고, 모델 서버는 Whisper 모델 파일처럼 바깥 자원으로 본다.

OPENCUT이 TTS에 대해 아는 것은 주소 하나(환경 변수 `TTS_URL`)와 `/voices`·`/config`·`/synth` 세 개의 계약뿐이다. 목소리 이름, 말투, 프리셋, 슬라이더 범위는 전부 서버에서 받는다. 그래야 목소리를 새로 학습해도 OPENCUT 코드를 고치지 않는다.

### 3-2. CORS는 Next 라우트로 넘긴다

`apps/web/src/app/api/tts/[...path]/route.ts` 하나를 만든다. 요청을 받으면 런타임에 `process.env.TTS_URL`을 읽어 그대로 전달하고, 서버가 꺼져 있으면 503과 함께 "TTS 서버가 꺼져 있습니다. `TTS/tts-web.sh`를 실행하세요" 메시지를 돌려준다. `next.config.ts`의 `rewrites`는 빌드할 때 주소가 굳어서 쓰지 않는다. `tts-web.py`에 CORS 헤더를 다는 방법도 있지만 브라우저가 서버 주소를 알아야 해서 설정이 두 곳으로 갈린다.

### 3-3. 문장마다 따로 합성한다

대본 전체를 한 번에 보내면 문장 경계 시간을 알 수 없어 자막을 맞추려면 Whisper로 다시 받아써야 한다. 문장마다 요청하면:

- 음성 파일 길이가 곧 자막 길이라 Whisper가 필요 없다. 16GB에서 TTS와 Whisper를 같이 올리지 않아도 된다.
- 문장 하나만 다시 만들 수 있다(4단계).
- 진행률을 "12문장 중 3번째"로 보여 줄 수 있고, 한 문장이 실패해도 나머지는 남는다.

문장 사이 쉼(`pause`)은 서버에 보내지 않고 타임라인의 클립 간격으로 둔다. 사람이 클립을 끌어 간격을 바로 고칠 수 있다. 문장 끊기는 `. ? ! …`와 줄바꿈 기준의 순수 함수(`tts/sentences.ts` `splitSentences`)로 하고 테스트를 붙인다. 너무 긴 문장(서버 `max_chars` 1000자는 넉넉하니, 실제 기준은 자막 `maxDuration`)은 쉼표에서 한 번 더 나눈다.

알려진 한계: 한 문장 안에서 자막을 여러 개로 나눌 때(숏폼 12자) 단어 시간은 글자 수 비율 추정이라 0.2~0.3초쯤 어긋날 수 있다. 문제가 되면 6단계에서 만든 음성에만 Whisper 단어 시간을 붙인다.

### 3-4. 오디오 형식은 WAV를 추가한다

지금은 mp3·m4a만 준다. 편집기 안에서 한 번 더 인코딩해 내보내므로 손실 압축을 두 번 거친다. `tts-web.py` `FORMATS`에 `"wav": ("pcm_s16le", ..., "wav", "audio/wav")` 한 줄을 더하고 OPENCUT은 WAV로 받는다. 문장 하나가 수백 KB라 용량 문제는 없다.

### 3-5. 클립에 합성 정보를 남긴다

다시 만들기와 "글자를 고쳐서 음성이 낡음" 표시를 하려면 음성 클립이 무엇으로 만들어졌는지 알아야 한다. `timeline/types.ts` `AudioElement`에 선택 필드 하나를 더한다.

```ts
/** 대본 읽기로 만든 음성. 다시 만들 때 이 값으로 요청한다 */
tts?: {
	text: string;
	voice: string;
	style: string;
	speed: number;
	strength: number;
	expressiveness: number;
	/** 만들 때 쓴 목소리 모델. 모델을 새로 학습한 뒤 예전 음성을 구분한다 */
	model: string;
	/** 같은 문장의 자막 클립들이 같은 값을 갖는다 */
	lineId: string;
};
```

자막 쪽 `TextElement`에는 `ttsLineId?: string`만 둔다. 자막 글자를 합친 값이 `tts.text`와 다르면 낡은 음성이다. 프로젝트 저장 형식이 바뀌므로 기존 프로젝트를 여는 테스트를 하나 둔다(선택 필드라 마이그레이션은 없다).

## 4. 화면

에셋 패널에 "대본 읽기" 탭을 추가한다(`TAB_KEYS`에 `tts`). 위에서 아래로:

1. 목소리: 송이 / 송강 (서버 `/voices`). 옆에 미리 듣기 버튼(짧은 고정 문장을 합성해 재생, 결과는 메모리에 캐시).
2. 프리셋: 일반, 나레이션, 뉴스, 광고, 친근한 대화 (서버 `/config` `presets`). 고르면 아래 값이 바뀐다.
3. 말투, 감정 강도, 표현력, 속도, 문장 사이 쉼. 슬라이더는 `AGENTS.md` 규칙대로 `Slider` + `onReset`, 기본값은 `/config` 값.
4. 자막 레이아웃: 기존 `CaptionLayoutFields`(숏폼/롱폼)를 그대로 쓴다. "자막 만들지 않기"도 고를 수 있게 둔다.
5. 대본 입력칸. 문장 수와 예상 길이를 아래에 보여 준다.
6. "재생헤드 위치에 만들기" 버튼, 진행률, 취소.

서버가 꺼져 있으면 탭 맨 위에 켜는 방법을 보여 주고 버튼을 막는다.

음성 클립을 고르면 속성 패널에 "대본 읽기" 칸이 생긴다: 문장 고치기, 다시 만들기, 테이크 3개 만들어 듣고 고르기. 자막 클립을 여러 개 고르고 "선택한 자막 읽기"를 누르면 각 자막 시작 위치에 음성이 붙는다(CapCut 방식).

문구는 `i18n/messages`에 한국어·영어로 넣는다.

## 5. 처리 흐름

```
대본 → splitSentences → 문장 i마다 (순서대로, 한 번에 하나):
  POST /api/tts/synth (format wav) → Blob → File("tts-송이-001.wav")
  → processMediaAssets → editor.media.addMediaAsset → 길이 d_i
  → 시작 t_i = t_(i-1) + d_(i-1) + pause
  → buildCaptionChunks({ segments: [{ text, start: t_i, end: t_i + d_i }], layout })
모두 끝나면 BatchCommand 하나로:
  AddTrack(audio) + AddTrack(text) + InsertElement(음성 n개) + InsertElement(자막 m개)
```

타임라인에는 끝에 한 번에 넣어 ⌘Z 한 번으로 전부 사라진다. 미디어 패널의 파일은 효과음 라이브러리와 같이 되돌리기 대상이 아니라 남는다. 취소하면 그때까지 만든 문장만 넣을지 묻지 않고 모두 버린다(단순하게 시작하고, 긴 대본에서 불편하면 바꾼다).

합성 서버는 모델 하나를 CPU로 돌리므로 동시에 보내도 빨라지지 않고 메모리만 는다. 요청은 하나씩 보낸다.

## 6. M1 16GB에서 돌리기

지금 구성(약 10GB)은 브라우저 + 편집기 + 영상 디코딩과 함께 쓰기엔 크다. 줄일 순서:

1. **합성 서버를 하나로 합친다.** `api_v2.py`에 `/set_gpt_weights`, `/set_sovits_weights`가 있다. 목소리를 바꿀 때만 가중치를 갈아 끼우면 서버 하나(약 3GB)로 모든 목소리를 처리한다. 앞으로 목소리가 늘어도 메모리가 늘지 않는다. 전환에 걸리는 시간을 재고, 한 대본은 한 목소리로 읽으니 전환은 대본마다 한 번이다. `tts-voices.json`은 목소리마다 포트 대신 가중치 경로를 갖게 바꾼다.
2. **송강 울림 제거를 합성 때 하지 않는다.** 저장소에 이미 `songkang2_dry_*` 클립이 있다. 울림을 걷은 데이터로 송강을 다시 학습하면 UVR5를 올릴 필요가 없다. 재학습 전까지는 UVR5를 쓸 때만 올리고 내리게 바꾼다.
3. **사전학습 모델 중 안 쓰는 것을 아내 맥에 보내지 않는다.** v1·v3·v4·bigvgan 등은 v2ProPlus 추론에 필요 없다(약 2.5GB).
4. **MPS(Apple GPU)는 실험만 한다.** 설정이 `device: cpu`다. MPS가 빨라지면 좋지만 GPT-SoVITS는 MPS에서 결과가 달라지는 경우가 있어, 측정 문장(`measure/sentences.txt`)으로 유사도·발음 오류를 비교한 뒤에만 바꾼다.

M1 속도는 M5보다 2~3배 느릴 것으로 예상한다(추정). 3분짜리 대본이면 몇 분 걸리므로 진행률 표시가 필수다. 아내 맥에서 실측해 이 문서를 고친다.

## 7. 목소리를 더 학습할 때

OPENCUT 쪽은 할 일이 없게 만드는 것이 목표다. 새 목소리나 새 버전을 추가하는 절차:

1. 개발 맥(M5)에서 `train.sh`로 학습한다. 학습은 아내 맥에서 하지 않는다.
2. `measure/`로 기존 모델과 비교해 나아졌는지 확인한다.
3. `tts-voices.json`에 목소리를 추가하거나 가중치 경로를 바꾼다. 말투 파일(`tts-styles-*.json`)을 만든다.
4. 목소리 묶음(가중치 + 참조 음성)을 새 버전으로 올린다(8절).
5. 아내 맥에서 업데이트 스크립트를 한 번 돌린다.

이를 위해 TTS 저장소에서 먼저 고칠 것:

- `tts.env`, `tts-voices.json`, `tts-styles*.json`의 `/Users/Dev/TTS/...` 절대 경로를 저장소 기준 상대 경로로 바꾼다. 아내 맥은 폴더 위치가 다르다.
- 목소리 항목에 `model` 값(예: `songkang2-e15`)을 둔다. 클립의 `tts.model`과 비교해 "예전 모델로 만든 음성"을 표시하고, 다시 만들지는 사람이 정한다.
- 참조 음성 `*.wav`는 지금 `.gitignore`에 걸려 있는데 합성에 꼭 필요하다. 목소리 묶음에 넣는다.

## 8. 아내 맥북으로 옮기기

GitHub 저장소 하나에 다 담을 수 없다. 가중치 파일 하나가 155~173MB라 GitHub 파일 한도(100MB)를 넘고, 사전학습 모델 4.6GB, 파이썬 가상환경 2.1GB가 따로 있다. 그래서 세 덩어리로 나눈다.

| 덩어리 | 어디에 | 아내 맥에서 받는 방법 |
|---|---|---|
| OPENCUT 코드 | GitHub `OPENCUT` (공개) | `git clone`, 이후 `start-mac.command`가 `git pull` |
| TTS 스크립트·설정 | GitHub `TTS_TEST` (비공개) | `git clone` |
| GPT-SoVITS 엔진 | upstream 고정 커밋 + 로컬 수정 패치 | `setup-mac.sh`가 clone → `patches/gpt-sovits.patch` 적용 → venv 설치 |
| 사전학습 모델 | Hugging Face 공식(`lj1995/GPT-SoVITS`) | `setup-mac.sh`가 필요한 파일만 받음 |
| 목소리 묶음 (가중치 + 참조 음성) | `TTS_TEST` GitHub Release 첨부 파일 (비공개, 파일당 2GB까지) | `gh release download voices-YYYYMMDD` |

목소리 묶음은 GitHub Release를 권한다. 이미 GitHub를 쓰고 있어 계정이 늘지 않고, 저장소가 비공개라 목소리가 공개되지 않으며, 버전 이름으로 예전 묶음을 되돌릴 수 있다. 다른 선택지는 Hugging Face 비공개 저장소(계정 추가)와 AirDrop·USB(버전 관리 없음)다.

`start-mac.command`는 옆 폴더 `../TTS`가 있으면 `tts-web.sh`를 먼저 켜고 `TTS_URL`을 넘긴 뒤 Next를 띄운다. TTS 폴더가 없으면 대본 읽기 탭만 "서버 없음"으로 뜨고 나머지는 그대로 동작한다.

아내 맥에서 처음 설치하는 순서(터미널, 인터넷 연결 상태):

1. Homebrew를 설치한다(https://brew.sh 첫 화면의 명령 한 줄).
2. `brew install gh && gh auth login`. `TTS_TEST`가 비공개라 GitHub 로그인이 필요하다.
3. OPENCUT을 받은 폴더 옆에서 `gh repo clone holyshine11/TTS_TEST TTS`를 실행하고, 이어서 `TTS/setup-mac.sh`를 실행한다. 패키지 2GB 남짓과 모델·목소리 약 1GB를 받는다.
4. 그 뒤로는 `start-mac.command`를 더블클릭하면 TTS도 함께 켜진다. 목소리를 업데이트할 때는 `TTS/setup-mac.sh`를 다시 실행한다.

설치가 끝나면 Wi-Fi를 끈 상태로 대본 → 음성·자막 생성이 되는지 확인한다(기존 오프라인 테스트 방식).

## 9. 단계

| 단계 | 저장소 | 내용 | 완료 기준 |
|---|---|---|---|
| 1 | TTS | 상대 경로, WAV 출력, 목소리 `model` 값 | 다른 폴더에 clone해도 `tts-web.sh`가 돌고 `/synth`가 WAV를 준다 |
| 2 | OPENCUT | `/api/tts` 라우트, `splitSentences`, 대본 읽기 탭, 문장별 합성 → 음성·자막 트랙 | 5문장 대본을 송이·송강으로 각각 만들면 음성과 자막 길이가 맞고, ⌘Z 한 번에 사라진다. 서버를 끄면 안내가 뜬다 |
| 3 | TTS | 서버 하나로 목소리 전환, UVR5 쓸 때만 올리기 | 두 목소리를 번갈아 써도 메모리 합계 4GB 이하 |
| 4 | OPENCUT | 문장 다시 만들기, 낡은 음성 표시, 테이크 고르기, 선택한 자막 읽기 | 자막 글자를 고치면 표시가 뜨고, 다시 만들면 그 문장 음성만 바뀐다 |
| 5 | TTS | `setup-mac.sh`, 패치 추출, 목소리 묶음 Release | 빈 계정에서 스크립트 하나로 설치되고 Wi-Fi 없이 합성된다 |
| 6 | 둘 다 | 아내 M1에서 실측, 필요하면 Whisper 단어 시간 정밀화 | 3분 대본 생성 시간과 메모리를 이 문서에 기록 |

진행 상황(2026-10-21): 1~5단계 완료, 6단계(아내 M1 실측)만 남았다.

3단계에서 한 일:
- 서버를 하나로 합쳤다. 지금 올라간 가중치는 서버가 바꿀 때마다 다시 쓰는 `.tts-server.yaml`에서 읽는다. 그래서 `tts.sh`나 `measure/eval.py`가 가중치를 바꿔도 어긋나지 않는다.
- UVR5는 `dereverb.py`로 문장마다 따로 띄운다. 프로세스가 끝나야 메모리를 돌려받기 때문이다. 띄우는 데 약 0.7초가 든다. 창 크기를 512에서 256으로 줄여 순간 메모리를 6.2GB에서 3.4GB로 낮췄다. 512로 만든 결과와의 차이는 SNR 30.5dB다(`tts.env` `TTS_DEREVERB_WINDOW`).
- 엔진이 BERT(1.3GB)를 처음 쓸 때 읽게 고쳤다. BERT는 중국어에만 쓰여 한국어만 읽으면 끝까지 올라가지 않는다.

5단계: `setup-mac.sh`가 도구, 엔진 고정 커밋과 패치, 파이썬 패키지(`requirements-mac.txt`), 사전학습 모델 280MB, UVR5 모델, 목소리 묶음(Release `voices-20261021`, 634MB)을 받는다. 끝나면 목소리마다 한 문장씩 합성해 확인한다. 다시 돌리면 업데이트가 된다. 목소리를 새로 학습하면 개발 맥에서 `./voices-release.sh`를 돌린다. `start-mac.command`는 옆 폴더 `../TTS`가 있으면 TTS를 함께 켜고, 창을 닫으면 같이 끈다.

1·2단계 메모: 2단계에서 계획과 다르게 간 점은 둘이다. 한 문장이라도 합성에 실패하면 아무것도 넣지 않고 몇 번째 문장인지 알려 준다. 서버에 보내는 `pause`(문장 안 쉼표 쉼)는 문장 사이 쉼 슬라이더 값과 같다. `start-mac.command`가 처음 실행할 때 `.env.example`을 `.env.local`로 복사해 `TTS_URL`을 잡는다.

## 10. 작업 방식

1단계와 2단계는 저장소가 달라 동시에 진행한다. 둘 사이 계약은 지금의 `/voices`·`/config`·`/synth`에 `format: "wav"` 하나만 더한 것으로 먼저 고정하고, 에이전트 둘을 각각 붙인다. TTS 쪽은 개발 맥에서 서버를 띄운 채 `curl`로, OPENCUT 쪽은 실제 서버에 붙여 `bun test`와 ego-browser로 확인한다. 3단계는 2단계 화면이 생긴 뒤 실제 사용 흐름으로 메모리를 재야 의미가 있어 그다음에 한다.

단위 테스트는 문장 끊기, 시작 시각 계산(쉼 포함), 낡은 음성 판정 세 가지에 붙인다. 합성 자체는 실제 서버로만 확인한다. 코드를 고친 뒤에는 `graphify update .`를 돌린다.

## 11. 정한 것 (2026-10-21)

- 목소리 묶음은 `TTS_TEST` GitHub Release로 보낸다.
- 대본 읽기는 에셋 패널의 새 탭으로 둔다.
- 송강을 울림 없는 데이터로 다시 학습하는 일은 학습을 다 마친 뒤로 미룬다. 그전까지는 6절 2번의 "UVR5를 쓸 때만 올리고 내리기"로 메모리를 줄인다.
