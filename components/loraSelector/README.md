# LoRA Selector 모듈

### 1. 목적
LoRA(Low-Rank Adaptation) 모델을 선택하고 가중치를 조절하는 UI를 제공합니다.

### 2. 주요 기능
- 사용 가능한 LoRA 모델 목록 표시
- 여러 LoRA를 다중 선택하고 각각의 가중치(weight)를 슬라이더로 조절
- 선택된 LoRA 구성을 `stateManager`에 업데이트

### 3. 원본 파일
- `js/components/loraSelector.js`

### 4. 의존성
- `core/stateManager.js`

### 5. 예상 API

```javascript
// loraSelector.js

export function init(containerElement) { ... }
export function getSelectedLoras() { /* [{ name: 'lora1', weight: 0.8 }, ...] */ ... }

// 내부적으로 stateManager.updateState('loras', selectedLoras) 호출
```
