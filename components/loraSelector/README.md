# LoRA Selector 모듈

### 1. 목적
LoRA(Low-Rank Adaptation) 모델을 선택하고 가중치를 조절하는 플로팅 패널용 UI 컴포넌트를 제공합니다.

### 2. 주요 기능
- **LoRA 모델 탐색**: 서버에서 불러온 LoRA 모델들을 폴더 구조로 표시
- **다중 선택**: 여러 LoRA를 동시에 선택하고 각각의 가중치(0.0~2.0) 슬라이더로 조절
- **검색 및 필터링**: LoRA 이름 검색, 선택된 것만 보기 모드 지원
- **미리보기 툴팁**: LoRA 파일에 미리보기 이미지가 있는 경우 마우스 오버시 표시
- **패널 통합**: 플로팅 패널 시스템과 완벽 연동, 다중 패널간 LoRA 공유 기능

### 3. 파일 구조
```
components/loraSelector/
├── loraSelector.js          # 메인 LoRA 선택기 컴포넌트 클래스
├── loraPanelDemo.js         # 플로팅 패널 연동 데모 및 활용 예시  
└── README.md               # 이 문서
```

### 4. 의존성
- `components/ui/floatingPanel/floatingPanel.js` (플로팅 패널 시스템)
- API 서버: `http://localhost:8001/api/models/loras` (LoRA 목록 조회)

### 5. API 사용법

#### 기본 사용법 (ES6 클래스)
```javascript
import { LoRASelectorComponent } from './components/loraSelector/loraSelector.js';

// 컴포넌트 생성
const loraSelector = new LoRASelectorComponent();

// DOM에 렌더링
const container = document.getElementById('lora-container');
const renderedElement = loraSelector.render();
container.appendChild(renderedElement);

// 초기화 (API 호출 및 이벤트 설정)
loraSelector.init();
```

#### 플로팅 패널에서 사용법
```javascript
import { createLoRASelectorPanel } from './components/loraSelector/loraPanelDemo.js';

// LoRA 선택기 패널 생성
const { panel, loraComponent } = createLoRASelectorPanel({
    title: '🎨 My LoRA Selector',
    x: 200,
    y: 150,
    width: 380,
    height: 600,
    markingColor: '#9b59b6'
});

// 선택 변경 이벤트 리스너
document.addEventListener('loraSelector:changed', (e) => {
    console.log('Selected LoRAs:', e.detail.selectedLoRAs);
});
```

#### 컴포넌트 API 메서드들
```javascript
// 현재 선택된 LoRA 목록 가져오기
const selectedLoRAs = loraComponent.getSelectedLoRAs();
// 반환 형태: [{ path, name, weight, subfolder }, ...]

// LoRA 선택 상태 설정
loraComponent.setSelectedLoRAs([
    { path: 'style/anime_v1.safetensors', name: 'anime_v1', weight: 1.2, subfolder: 'style' },
    { path: 'character/girl_v2.safetensors', name: 'girl_v2', weight: 0.8, subfolder: 'character' }
]);

// 단일 LoRA 추가
loraComponent.addLoRA('effects/glow_v3.safetensors', 1.5);

// 단일 LoRA 제거  
loraComponent.removeLoRA('effects/glow_v3.safetensors');

// 모든 선택 해제
loraComponent.clearAllLoRAs();

// 컴포넌트 정리 (메모리 해제)
loraComponent.destroy();
```

### 6. 이벤트 시스템

#### 발생하는 이벤트들
```javascript
// LoRA 선택이 변경될 때마다 발생
document.addEventListener('loraSelector:changed', (e) => {
    console.log('Selected LoRAs:', e.detail.selectedLoRAs);
});

// 패널 데모에서 제공하는 통합 이벤트
document.addEventListener('loraPanelDemo:selectionChanged', (e) => {
    console.log(`Panel ${e.detail.panelId}: ${e.detail.count} LoRAs selected`);
});
```

### 7. 데모 실행 방법

#### 다중 LoRA 패널 데모 (권장)
```javascript
import { runMultiLoRAPanelDemo } from './components/loraSelector/loraPanelDemo.js';

// 3개의 LoRA 패널을 생성하고 패널간 LoRA 공유 기능 포함
const { panels, components } = runMultiLoRAPanelDemo();
```

#### 단순 LoRA 패널 데모
```javascript
import { runSimpleLoRAPanelDemo } from './components/loraSelector/loraPanelDemo.js';

// 단일 LoRA 패널 생성
const { panel, loraComponent } = runSimpleLoRAPanelDemo();
```

### 8. 스타일링 및 UI 특징

- **모던 UI**: Segoe UI 폰트, 부드러운 그라데이션 및 그림자 효과
- **반응형**: 스크롤 가능한 영역과 고정 헤더로 다양한 화면 크기 대응
- **사용자 친화적**: 직관적인 아이콘, 툴팁, 호버 효과
- **접근성**: 키보드 네비게이션, 명확한 시각적 피드백
- **성능 최적화**: 이벤트 위임, 메모리 누수 방지, 효율적인 DOM 조작

### 9. 서버 요구사항

LoRA 목록을 제공하는 API 서버가 필요합니다:

**엔드포인트**: `GET http://localhost:8001/api/models/loras`

**응답 형식**:
```json
[
  {
    "name": "anime_style_v1.safetensors",
    "path": "style/anime_style_v1.safetensors", 
    "subfolder": "style",
    "preview_image": "http://localhost:8001/previews/anime_style_v1.png"
  },
  {
    "name": "character_girl.safetensors",
    "path": "character/character_girl.safetensors",
    "subfolder": "character", 
    "preview_image": null
  }
]
```

### 10. 확장성 및 커스터마이징

컴포넌트는 확장 가능한 구조로 설계되었습니다:

- **테마 커스터마이징**: CSS 변수를 통한 색상 및 스타일 조정 가능
- **추가 필터링**: 검색 로직 확장하여 태그, 카테고리 등 추가 필터 구현 가능  
- **다국어 지원**: 텍스트 상수 분리하여 다국어 지원 구현 가능
- **플러그인 아키텍처**: 추가 기능을 플러그인 형태로 확장 가능

### 11. 문제 해결

**LoRA 목록이 로드되지 않는 경우:**
- API 서버(`http://localhost:8001`)가 실행 중인지 확인
- 브라우저 개발자 도구에서 네트워크 오류 확인
- CORS 설정이 올바른지 확인

**컴포넌트가 렌더링되지 않는 경우:**
- `render()` 후 `init()` 메서드 호출 확인
- 컨테이너 엘리먼트가 DOM에 존재하는지 확인
- JavaScript 콘솔에서 오류 메시지 확인

**메모리 누수 의심되는 경우:**
- 컴포넌트 사용 완료 후 `destroy()` 메서드 호출
- 불필요한 이벤트 리스너가 정리되었는지 확인
