# UI 모듈

### 1. 목적
애플리케이션의 전반적인 UI 상호작용(예: 패널 접기/펴기, 탭 전환, 모달 창 등)을 관리합니다. 특정 기능에 종속되지 않는 공통 UI 로직을 담당합니다.

### 2. 주요 기능
- 패널(collapsible) 상태 관리
- 동적으로 UI 요소(예: 알림 메시지) 생성 및 제거
- 전체적인 레이아웃 및 테마(라이트/다크 모드) 관리

### 3. 원본 파일
- `js/core/ui.js`
- `css/collapsible.css` 관련 로직

### 4. 의존성
- 없음

### 5. 예상 API

```javascript
// ui.js

export function init() { ... }
export function togglePanel(panelId) { ... }
export function showNotification(message, type) { ... }
```
