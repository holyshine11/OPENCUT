# 전환(Transition) 구현 계획

CapCut 전환 패널을 레퍼런스로 삼는다. 같은 트랙에서 맞붙은 두 클립(영상·이미지) 사이 경계에 전환을 하나 걸고, 길이를 조절하고, 트랙 전체에 한 번에 적용할 수 있게 한다.

## 1. 기존 코드에서 그대로 쓰는 것

- **오디오 크로스페이드 모델** (`timeline/audio-fade.ts` `resolveCrossfades`): 왼쪽 클립의 `crossfade` 값으로 다음 클립과의 경계를 표시하고, 타임라인 위치는 그대로 둔 채 양쪽 원본 핸들(trim으로 잘린 부분)을 끌어와 겹친다. 전환도 같은 방식으로 간다. 리플(전체 길이 변경)이 없어서 다른 트랙과 싱크가 깨지지 않는다.
- **분할 시 경계 정리** (`split-elements.ts` `clearFade`): 크로스페이드는 왼쪽 조각에서 떼고 오른쪽 조각이 이어받는다. 전환도 똑같이 처리한다.
- **이펙트 정의 구조** (`effects/types.ts` `EffectDefinition`, `registry.ts`): 전환 정의도 type, name, category, keywords, params, 셰이더 uniforms 함수로 만든다.
- **이펙트 썸네일** (`effect-preview.ts`, `EffectPreviewCanvas`): 전환 썸네일 렌더에 재사용한다.
- **익스포트**: `scene-exporter`가 같은 scene builder를 쓰므로 렌더 경로만 붙이면 내보내기에도 들어간다.

## 2. 데이터 모델

`VideoElement`·`ImageElement`에 선택 필드 하나를 추가한다.

```ts
/** 바로 뒤에 맞붙은 클립으로 넘어가는 전환. 맞붙은 클립이 없으면 무시된다 */
transition?: {
	type: string;        // 전환 정의 id (예: "dissolve", "push")
	duration: number;    // 초
	params: ParamValues; // 방향, 부드러움 등
};
```

- 경계에 별도 엔티티를 두지 않는다. 클립을 옮기거나 지우면 전환은 저절로 무효가 되고, 다시 붙이면 살아난다.
- 카테고리는 `EffectCategory`처럼 문자열 유니언 타입으로 둔다(enum 금지 규칙).
- 기본 길이와 최소 길이는 `DEFAULTS.element.crossfade` 옆 `timeline/defaults.ts`에 둔다. CapCut 기본값은 0.5초다.
- 분할: 왼쪽 조각의 `transition`을 지우고 오른쪽 조각에 남긴다. 복제·복사는 필드를 그대로 따라간다.

## 3. 경계 해석과 핸들 부족 처리

`resolveCrossfades`를 일반화해 비디오 쪽에서도 쓴다. 차이가 하나 있다. 오디오는 핸들이 모자라면 크로스페이드를 줄이지만, 화면 전환은 사용자가 정한 길이를 지키는 편이 CapCut과 같다. 그래서 핸들이 모자란 부분은 클립의 첫·끝 프레임을 정지 화면으로 늘려 채운다. 이미지는 핸들이 무한하므로 언제나 정상이다.

순수 함수로 두고 `__tests__`에 케이스를 넣는다: 핸들 충분, 한쪽 부족, 양쪽 0, 클립 길이보다 긴 전환(클립 길이의 절반으로 제한), 떨어진 클립, 여러 경계 연속.

## 4. 렌더링 파이프라인

### TS (scene builder → frame descriptor)

1. `scene-builder.ts`에서 트랙별로 경계를 해석하고, 전환이 걸린 두 클립 노드를 전환 구간만큼 늘린다(A는 뒤로, B는 앞으로 — 크로스페이드가 오디오 구간을 늘리는 것과 같은 계산).
2. 두 노드를 `TransitionNode { from, to, start, duration, definition, params }`로 감싼다. 구간 밖에서는 자식이 평소처럼 렌더된다.
3. `frame-descriptor.ts`에 아이템 종류를 하나 추가한다.

```ts
| {
		type: "transition";
		fromItems: FrameItemDescriptor[];
		toItems: FrameItemDescriptor[];
		passes: EffectPass[]; // uniforms에 u_progress 포함
  }
```

클립 하나가 레이어·마스크·스트로크 등 아이템 여러 개를 낼 수 있어서 레이어 하나가 아니라 아이템 배열로 받는다.

### Rust (compositor)

1. `render_frame`과 `render_frame_to_texture`에 똑같이 들어 있는 아이템 루프를 `composite_items(items, base_texture)` 함수 하나로 뽑는다.
2. `Transition` 아이템은 `fromItems`, `toItems`를 각각 투명 텍스처에 합성하고, 전환 셰이더(from, to, progress)로 하나로 섞은 뒤 normal 블렌드로 씬에 얹는다.
3. 셰이더는 `rust/crates/effects/src/shaders/`에 계열별 파일로 둔다. 효과마다 셰이더를 따로 만들지 않고 계열 셰이더에 `u_kind`와 파라미터 uniform을 넘긴다.

### 반드시 고칠 것: 같은 영상 두 시점 디코딩

`services/video-cache/service.ts`는 `mediaId` 하나에 sink 하나를 두고, 새 seek가 들어오면 이전 요청을 무효로 만든다. 한 영상을 잘라 붙인 경계(가장 흔한 경우)에서 A와 B가 같은 미디어의 다른 시점을 동시에 요청하면, 한쪽은 엉뚱한 프레임을 받고 매 프레임 seek가 반복된다. 전환의 `to` 쪽은 캐시 키를 `${mediaId}#transition`처럼 분리해 sink를 따로 쓰게 한다. 전환 구간이 끝나면 그 sink는 해제한다.

## 5. 전환 카탈로그 (CapCut 분류 기준)

방향만 다른 효과는 타일을 따로 만들지 않고 `direction` 파라미터 하나로 묶는다.

| 분류 | 전환 | 셰이더 계열 | 단계 |
|---|---|---|---|
| 기본 | 디졸브(Mix), 검은 화면 페이드, 흰 화면 플래시 | mix | 1 |
| 기본 | 흐림 전환, 줌 인, 줌 아웃 | zoom / blur | 2 |
| 슬라이드 | 밀어내기(Push), 덮기(Slide), 상하좌우 | slide | 2 |
| 와이프 | 직선 와이프, 대각선 와이프, 시계 와이프, 블라인드 | wipe | 2 |
| 마스크 | 원형, 사각, 다이아몬드, 하트, 별 | shape (SDF) | 2 |
| 카메라 | 회전(Spin), 당기기(Pull in), 밀기(Pull out), 흔들림, 휩 팬 | camera | 3 |
| 효과 | 글리치, RGB 분리, 픽셀화, 섬광, 빛 번짐(Light leak) | glitch / light | 3 |
| 3D | 큐브, 플립, 페이지 넘김 | 3d | 4 |

흐림·휩 팬은 블러 패스가 필요하다. 기존 `gaussian_blur.wgsl` 패스를 progress에 따라 강도를 바꿔 이어 붙인다.

## 6. UI

### 에셋 패널 "전환" 탭 (`components/editor/panels/assets/index.tsx`의 "곧 추가됩니다" 자리)

- 상단에 분류 칩, 아래에 썸네일 그리드. 썸네일은 샘플 이미지 A·B로 렌더하고, 마우스를 올리면 progress 0→1을 반복 재생한다.
- 타일 클릭: 선택된 경계가 있으면 거기에, 없으면 선택된 클립과 다음 클립 사이 경계에 적용한다. 대상이 없으면 `noCrossfadePair`와 같은 토스트를 띄운다.
- 타일을 타임라인의 경계로 드래그해 놓아도 적용된다.

### 타임라인

- 맞붙은 영상·이미지 클립 사이에 경계 아이콘을 그린다. 전환이 없으면 호버 때만 흐리게, 있으면 항상 보이고 전환 구간 폭만큼 반투명 막대로 겹쳐 그린다.
- 아이콘 클릭으로 전환을 선택하고, Delete로 지운다. 선택 상태는 기존 selection 스토어에 "경계 선택" 종류로 추가한다.

### 속성 패널 (전환 선택 시)

- 전환 이름, 길이 슬라이더(최소값 ~ 두 클립 중 짧은 쪽 길이), 전환별 파라미터(방향 등). 슬라이더는 ⌘-클릭으로 기본값 복귀(`onReset`) 규칙을 따른다.
- "전체 적용": 같은 트랙의 모든 경계에 같은 전환과 길이를 건다.
- "오디오 크로스페이드 함께": 켜면 왼쪽 클립의 `crossfade`를 전환 길이와 맞춘다. 기존 오디오 크로스페이드를 그대로 쓰므로 추가 오디오 코드가 없다.
- 모든 변경은 `updateElements`를 거쳐 undo가 된다.

## 7. 단계별 작업

**1단계: 뼈대 + 디졸브 하나**
데이터 필드, 경계 해석 함수와 테스트, 분할 처리, TransitionNode, frame descriptor 아이템, Rust `composite_items` 리팩터와 Transition 아이템, mix 셰이더, video-cache 키 분리. 속성 패널 없이 단축키나 임시 버튼으로 디졸브를 걸어 미리보기와 익스포트 결과가 같은지 ego-browser로 확인한다.

**2단계: UI**
전환 탭(그리드, 분류 칩, 썸네일), 타임라인 경계 아이콘과 선택, 속성 패널(길이, 파라미터, 전체 적용, 오디오 크로스페이드 연동), 드래그 적용.

**3단계: 카탈로그 확장**
표의 2~3단계 계열 셰이더를 하나씩 추가한다. 계열 하나 = 셰이더 파일 하나 + 정의 여러 개.

**4단계: 고급**
3D 계열, 즐겨찾기(`adjust-favorites-store` 패턴), 전환 프리셋.

## 8. 위험과 확인할 점

- **성능**: 전환 구간에서는 영상 두 개를 동시에 디코딩하고 텍스처 두 장을 더 합성한다. 1단계 끝에 4K 소스로 재생 프레임을 측정한다.
- **키프레임**: 늘린 구간(핸들 영역)에서 애니메이션 값은 클립 시작·끝 값으로 고정한다. `getElementLocalTime`이 범위 밖 시간을 어떻게 다루는지 1단계에서 확인한다.
- **트랙 간 전환**: CapCut처럼 같은 트랙의 경계만 지원한다. 위아래 트랙 사이 전환은 범위 밖이다.
- **텍스트·스티커·그래픽**: CapCut도 이들에는 전환 대신 입장·퇴장 애니메이션을 쓴다. 이번 범위에서 뺀다.
