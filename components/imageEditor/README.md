# Image Editor 모듈

### 1. 목적
캔버스의 이미지 객체에 대한 편집 기능을 제공합니다. 더블클릭으로 활성화되는 컨텍스트 메뉴를 통해 다양한 이미지 편집 도구에 접근할 수 있습니다.

### 2. 주요 기능
- 밝기/대비 조절
- 색상 필터 (그레이스케일, 세피아, 반전)
- 회전 및 스케일링
- 자르기 기능
- 블러/선명화 효과
- 컨텍스트 메뉴 UI

### 3. 의존성
- Konva.js
- `core/stateManager.js`

### 4. 예상 API

```javascript
// imageEditor.js

export function init(stage, layer) { ... }
export function showContextMenu(imageNode, x, y) { ... }
export function applyBrightnessContrast(imageNode, brightness, contrast) { ... }
export function applyColorFilter(imageNode, filterType) { ... }
export function rotateImage(imageNode, angle) { ... }
export function cropImage(imageNode, cropArea) { ... }
export function applyBlur(imageNode, intensity) { ... }
```

### 5. 편집 도구
- **BrightnessContrast**: 밝기와 대비 조절
- **ColorFilters**: 색상 필터 적용 
- **Transform**: 회전, 스케일링, 위치 조정
- **Crop**: 이미지 자르기
- **Effects**: 블러, 선명화 등 효과