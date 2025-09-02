# Canvas 모듈

### 1. 목적
WebDraw Studio의 핵심 기능인 드로잉 보드와 관련된 모든 시각적 요소 및 상호작용을 관리합니다. 이 모듈은 `fabric.js`를 대체하여 캔버스 기능을 독립적으로 제공하는 것을 목표로 합니다.

### 2. 주요 기능
- 이미지 로드 및 캔버스에 표시
- 브러시, 지우개 등 드로잉 도구 제공
- 객체(이미지, 드로잉) 선택, 이동, 크기 조절, 회전
- 캔버스 상태를 이미지 데이터(e.g., base64)로 내보내기
- 캔버스 확대/축소 및 패닝

### 3. 원본 파일
- `js/core/canvas.js`

### 4. 의존성
- **Canvas API (Native JavaScript) 또는 경량 Canvas 라이브러리 (예: Konva.js, Paper.js)**
- `core/stateManager.js` (애플리케이션의 다른 부분과 상태를 동기화하기 위해)

### 5. 예상 API

```javascript
// canvas.js

export function init(canvasElement) { ... }
export function loadImage(imageUrl) { ... }
export function setTool(toolName) { /* 'brush', 'eraser' */ ... }
export function getCanvasAsDataURL() { ... }
export function clearCanvas() { ... }

// 이벤트 리스너
// canvasElement.addEventListener('object:modified', (e) => { ... });
```
