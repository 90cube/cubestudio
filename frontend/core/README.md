# Core 모듈

### 1. 목적
WebDraw Studio 애플리케이션의 전체 생명주기를 관리하고, 각 모듈 간의 통신을 중재하는 핵심 로직을 담당합니다.

### 2. 주요 파일 및 기능

#### `app.js` (Application Entry Point)
- **목적**: 애플리케이션의 메인 진입점.
- **기능**:
    - 페이지 로드 시 모든 컴포넌트 모듈(`canvas`, `prompt`, `parameters` 등)을 초기화하고 DOM에 마운트합니다.
    - 전역 이벤트 리스너(예: 'Generate' 버튼 클릭)를 설정하고 적절한 모듈의 함수를 호출합니다.
    - `stateManager`를 초기화하고 주입합니다.
- **원본 파일**: `js/app.js`

#### `stateManager.js` (State Management)
- **목적**: 애플리케이션의 중앙 상태 저장소. 컴포넌트 간의 통신을 위한 허브 역할을 합니다.
- **기능**:
    - 애플리케이션의 공유 상태(예: 선택된 모델, 생성 파라미터, 프롬프트 등)를 저장합니다.
    - 상태 변경을 위한 `updateState(key, value)`와 같은 메서드를 제공합니다.
    - 특정 상태가 변경되었을 때 이를 구독(subscribe)하는 다른 컴포넌트에 변경 사항을 알리는 'pub/sub' 패턴을 구현합니다.
- **원본 파일**: `js/core/stateManager.js`

### 3. 의존성
- 모든 `components/*` 모듈
