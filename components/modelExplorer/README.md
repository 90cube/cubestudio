# Model Explorer 모듈

### 1. 목적
사용 가능한 Stable Diffusion 모델 목록을 탐색하고 선택할 수 있는 UI를 제공합니다.

### 2. 주요 기능
- 모델 목록을 서버로부터 비동기적으로 로드하여 표시
- 모델 선택 기능 제공
- 모델 선택 시 `stateManager`를 통해 선택된 모델 정보를 다른 모듈에 알림

### 3. 원본 파일
- `js/components/modelExplorer.js`

### 4. 의존성
- `core/stateManager.js`
- `fetch` API (서버 통신용)

### 5. 예상 API

```javascript
// modelExplorer.js

export function init(containerElement) { ... }
export function getSelectedModel() { ... }

// 내부적으로 stateManager.updateState('selectedModel', model) 호출
```
