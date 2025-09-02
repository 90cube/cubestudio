# Prompt 모듈

### 1. 목적
사용자가 Stable Diffusion 모델에 전달할 긍정(Positive) 및 부정(Negative) 프롬프트를 입력하고 관리하는 UI 컴포넌트입니다.

### 2. 주요 기능
- 긍정/부정 프롬프트 텍스트 입력 UI 제공
- 입력된 프롬프트 값 관리
- 프롬프트 변경 시 `stateManager`를 통해 다른 모듈에 변경 사항 전파

### 3. 원본 파일
- `js/components/prompt.js`

### 4. 의존성
- `core/stateManager.js`

### 5. 예상 API

```javascript
// prompt.js

export function init(containerElement) { ... }
export function getPrompts() { /* { positive: '...', negative: '...' } */ ... }

// 내부적으로 stateManager.updateState('prompts', newPrompts) 호출
```
