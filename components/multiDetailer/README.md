# Multi-Detailer 모듈

### 1. 목적
이미지 생성 시 여러 디테일러(Detailer)를 단계적으로 적용하여 결과물의 완성도를 높이는 기능을 관리하는 UI를 제공합니다.

### 2. 주요 기능
- 여러 디테일러를 추가, 제거, 순서 변경하는 UI 제공
- 각 디테일러의 세부 설정(예: 적용 강도) 관리
- 설정된 디테일러 구성을 `stateManager`에 업데이트

### 3. 원본 파일
- `js/components/multiDetailer.js`

### 4. 의존성
- `core/stateManager.js`

### 5. 예상 API

```javascript
// multiDetailer.js

export function init(containerElement) { ... }
export function getDetailerConfig() { ... }

// 내부적으로 stateManager.updateState('detailers', detailerConfig) 호출
```
