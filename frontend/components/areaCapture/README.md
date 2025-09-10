# Area Capture 모듈

### 1. 목적
캔버스의 특정 영역을 선택하여 해당 부분만 이미지로 만들거나 특정 작업을 적용하는 기능을 제공합니다. `fabric_image_capture.html`의 기능을 대체하고 통합합니다.

### 2. 주요 기능
- 캔버스 위에서 드래그하여 사각 영역을 선택하는 UI 제공
- 선택된 영역의 좌표와 크기 정보 관리
- 선택 영역을 이미지 데이터로 추출하는 기능

### 3. 원본 파일
- `js/components/areaCapture.js`
- `fabric_image_capture.html`

### 4. 의존성
- `components/canvas/canvas.js`
- `core/stateManager.js`

### 5. 예상 API

```javascript
// areaCapture.js

export function init(containerElement, canvasModule) { ... }
export function startCaptureMode() { ... }
export function stopCaptureMode() { ... }

// 캡처 완료 시 stateManager.updateState('capturedArea', areaData) 호출
```
