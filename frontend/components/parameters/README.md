# Parameters 모듈

### 1. 목적
Stable Diffusion 모델의 생성 파라미터(예: Steps, CFG Scale, Seed 등)를 조절하는 UI 컴포넌트를 제공합니다.

### 2. 주요 기능
- 각 파라미터를 위한 슬라이더, 입력 필드, 체크박스 등 UI 요소 제공
- 파라미터 값 변경 시 유효성 검사
- 변경된 파라미터 값을 `stateManager`를 통해 애플리케이션의 다른 부분에 전파

### 3. 원본 파일
- `js/components/parameters.js`

### 4. 의존성
- `core/stateManager.js`

### 5. 예상 API

```javascript
// parameters.js

export function init(containerElement) { ... }
export function getParameters() { /* { steps: 30, cfg_scale: 7.5, ... } */ ... }

// 내부적으로 stateManager.updateState('generationParams', newParams) 호출
```
