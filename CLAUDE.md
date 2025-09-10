# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### ⚠️ IMPORTANT: Check Background Servers First
**ALWAYS check for existing background servers before starting new ones to avoid port conflicts!**

```bash
# 1. Check for existing background servers (use BashOutput tool to check their status)
# Look for these IDs in system reminders: 83746c (backend), 2736e1 (frontend)

# 2. If servers are already running on correct ports:
# - Backend: http://127.0.0.1:8080 ✅ 
# - Frontend: http://127.0.0.1:9000 ✅
# → DO NOT start new servers! Use existing ones.

# 3. Only start new servers if none are running or ports are wrong
```

### Starting Full Application
```bash
# Method 1: Start both frontend and backend together
run_all.bat          # HTTP server on port 8080
run_all_http.bat     # HTTP server on port 8080

# Method 2: Start services separately
npm start            # Frontend only (port 9000)
run_frontend.bat     # Frontend only (port 9000)
python -m backend.main  # Backend only (port 8080) - UPDATED PATH

# Method 3: Clean restart (if ports are conflicted)
./kill_ports.bat     # Kill existing processes
npm start            # Then start fresh
python -m backend.main
```

### Backend Service
- **Main Backend**: `unified_backend_service.py` (루트 디렉토리)
- **Port**: 8080 (Flask API server)
- **Features**: 체크포인트, VAE, LoRA 모델 관리, 전처리기 시스템, 이미지 생성
- **Logging**: `unified_backend.log`에 모든 로그 기록

### Frontend Service
- **Port**: 9000 (live-server)
- **No Build Process**: 바닐라 JavaScript, 빌드 과정 없음
- **Auto Reload**: 파일 변경 시 자동 새로고침

### No Testing Framework
Currently no test suite is configured. The package.json test script returns an error message.

## 🔥 Current Project Status (2024-09-09)

### Project Structure Overview
이 프로젝트는 **CUBE Studio** - 웹 기반 AI 이미지 생성 및 편집 도구로, 현재 통합 백엔드 중심의 아키텍처를 사용 중입니다.

```
Cubestudio/
├── unified_backend_service.py  # 🔥 핵심 통합 백엔드 (모든 AI 기능)
├── core/                       # 프론트엔드 애플리케이션 관리
│   ├── app.js                 # 🔥 메인 진입점, 컴포넌트 초기화
│   └── stateManager.js        # 중앙 상태 관리 (미구현)
├── components/                 # UI 컴포넌트 모듈
│   ├── canvas/               # 🔥 Konva.js 캔버스 (드래그&드롭)
│   ├── controlnet/           # 🔥 ControlNet 관리 시스템
│   ├── prompt/               # 프롬프트 입력
│   ├── parameters/           # 생성 파라미터
│   ├── modelExplorer/        # 모델 선택
│   ├── loraSelector/         # LoRA 선택
│   └── [other components]    # 기타 UI 컴포넌트들
├── preprocessors/             # 🔥 전처리기 시스템 (Python)
│   ├── base_preprocessor.py  # 기본 전처리기 클래스
│   ├── depth_processor.py    # 뎁스 맵 생성 (MiDaS)
│   ├── edge_processor.py     # 엣지 감지 (Canny)
│   └── pose_processor.py     # 포즈 감지 (OpenPose)
├── renewal/                   # 🚨 참조용 가이드 구조 (구현 아님)
├── backend/                   # ❌ 미완성 모듈화 시도 (현재 사용 안함)
├── to_delete_in_renewal/      # 테스트 파일들 임시 보관
└── models -> ComfyUI/models   # 심볼릭 링크 (AI 모델들)
```

### 🚨 Critical Architecture Status

**🔥 현재 작업 중인 핵심 파일들:**
1. **`unified_backend_service.py`** - 통합 백엔드 서비스 (모든 AI 기능 포함)
2. **`core/app.js`** - 프론트엔드 메인 진입점
3. **`components/canvas/canvas.js`** - Konva.js 기반 캔버스 시스템
4. **`components/controlnet/`** - ControlNet 관리 시스템
5. **`preprocessors/`** - 전처리기 모듈들 (Python)

**📁 폴더 역할 명확화:**
- **`renewal/`** - 🚨 **참조용 가이드 구조만!** 실제 구현 아님. 각 컴포넌트의 README.md에 상세 기능 명세 있음
- **`backend/`** - ❌ **사용 안함.** 미완성 모듈화 시도, 현재는 `unified_backend_service.py` 사용
- **`to_delete_in_renewal/`** - 테스트 파일들 임시 보관소

### Current Architecture Patterns

**통합 백엔드 아키텍처 (`unified_backend_service.py`)**:
- 단일 Flask 서버로 모든 AI 기능 통합
- 체크포인트, VAE, LoRA 모델 관리
- 전처리기 시스템 (MiDaS, Canny, OpenPose)
- 이미지 생성 및 변환 API
- ComfyUI 모델 디렉토리와 연동

**프론트엔드 모듈 아키텍처 (`core/`, `components/`)**:
- ES6 모듈 기반 컴포넌트 시스템
- `core/app.js`를 통한 컴포넌트 초기화
- Konva.js 기반 캔버스 (Fabric.js 완전 대체)
- HTML 컨테이너 + JavaScript 모듈 패턴

**Renewal 가이드 구조 (`renewal/` - 참조용만)**:
- 🚨 **실제 구현 아님, 가이드 역할만**
- 각 컴포넌트 README.md에 상세한 기능 명세와 예상 API 문서화
- Pub/sub 패턴 설계 가이드 (stateManager 중심)
- 향후 리팩토링 시 참고용 아키텍처 가이드

### Key Technical Details

**🔥 현재 실제 동작하는 시스템:**

**백엔드 시스템 (`unified_backend_service.py`)**:
- **Flask API 서버** (포트 8080)
- **모델 관리**: 체크포인트, VAE, LoRA 자동 스캔 및 로딩
- **전처리기**: MiDaS (뎁스), Canny (엣지), OpenPose (포즈) - 모델 기반 + 직접 알고리즘 구현
- **이미지 생성**: Stable Diffusion 파이프라인
- **ComfyUI 연동**: 심볼릭 링크를 통한 모델 공유

**캔버스 시스템 (`components/canvas/canvas.js`)**:
- **Konva.js** 기반 2D 캔버스 (Fabric.js 완전 대체됨)
- 드래그 앤 드롭 이미지 지원, 자동 위치 조정
- 반응형 캔버스 크기 조정
- 실제 구현된 핵심 컴포넌트

**ControlNet 시스템 (`components/controlnet/`)**:
- 전처리기 선택 및 파라미터 조정 UI
- 백엔드 전처리기 시스템과 연동
- 실시간 프리뷰 및 처리 결과 표시

**프론트엔드 컴포넌트 로딩**:
- ES6 모듈 기반, `init()` 함수 패턴
- `core/app.js`가 컨테이너 ID로 컴포넌트들 초기화
- **일부 컴포넌트는 아직 빈 플레이스홀더 상태**

**상태 관리**:
- `core/stateManager.js` 존재하지만 아직 비어있음
- 현재는 중앙 상태 관리 미구현
- 컴포넌트 간 직접 통신 사용 중

**스타일링**:
- `assets/css/style.css`에 최소한의 CSS
- HTML에 시맨틱 컨테이너 div, JavaScript 모듈이 채움

### 🔥 Recent Completed Work (2024-09-09)

1. **OpenCV Canny 직접 구현**: 모델 기반에서 OpenCV 직접 알고리즘으로 변경
2. **프로젝트 정리**: 테스트 파일들을 `to_delete_in_renewal/` 폴더로 이동
3. **`.gitignore` 업데이트**: 불필요한 파일들 제외 설정
4. **통합 백엔드 안정화**: `unified_backend_service.py` 기능 검증 및 최적화
5. **전처리기 시스템 완성**: MiDaS, Canny, OpenPose 모든 전처리기 동작 확인

### 🚨 Development Status & Priority

**현재 상태:**
- **통합 백엔드**: ✅ 완전 동작, 모든 AI 기능 구현됨
- **프론트엔드 캔버스**: ✅ Konva.js 기반으로 완전 동작
- **ControlNet 시스템**: ✅ UI 및 백엔드 연동 완료
- **기타 컴포넌트들**: ⚠️ 대부분 빈 플레이스홀더 상태

**우선순위 작업:**
1. **프론트엔드 컴포넌트 구현**: prompt, parameters, modelExplorer 등
2. **중앙 상태 관리**: `core/stateManager.js` 구현
3. **백엔드 모듈화**: `unified_backend_service.py` → `backend/` 폴더로 재구축

### 🏗️ Future Roadmap

**Phase 1: 프론트엔드 완성**
- 빈 컴포넌트들 실제 구현
- stateManager 중앙 상태 관리 도입
- renewal/ 가이드 따라 API 표준화

**Phase 2: 백엔드 모듈화**
- `unified_backend_service.py`를 기반으로 `backend/` 재구축
- 모듈별 분리: 모델 관리, 전처리기, 이미지 생성
- API 표준화 및 최적화

**Phase 3: 고급 기능**
- 실시간 프리뷰 시스템
- 배치 처리 기능
- 성능 최적화

### Development Environment

- **Python 가상환경**: `.venv` 폴더 (백엔드 AI 모델 통합용)
- **개발 언어**: 프론트엔드(JavaScript), 백엔드(Python)
- **타겟 사용자**: 한국어 사용자 (문서도 한국어 중심)
- **모델 저장소**: ComfyUI 모델과 심볼릭 링크 공유

### 📋 Working with This Project

**새 세션에서 작업할 때 체크할 것들:**
1. **백엔드 상태 확인**: `python unified_backend_service.py` 실행 중인지 확인 (포트 8080)
2. **프론트엔드 실행**: `npm start` 또는 `run_frontend.bat` (포트 9000)
3. **로그 확인**: `unified_backend.log` 에서 에러 상황 파악
4. **모델 링크 확인**: `models` 폴더가 ComfyUI와 제대로 연결되어 있는지

**코드 작업 시 주의사항:**
- **renewal/ 폴더**: 참조용 가이드만, 실제 구현하지 말 것
- **backend/ 폴더**: 현재 사용 안함, `unified_backend_service.py` 사용
- **실제 작업 파일**: `core/app.js`, `components/*/`, `unified_backend_service.py`

### 🔧 Current Implementation Status

**✅ 완전 구현된 컴포넌트:**
- `unified_backend_service.py` - 통합 백엔드 (모든 AI 기능)
- `components/canvas/canvas.js` - Konva.js 캔버스 시스템
- `components/controlnet/` - ControlNet UI 및 백엔드 연동
- `preprocessors/` - 전처리기 시스템 (MiDaS, Canny, OpenPose)

**⚠️ 미완성/빈 컴포넌트:**
- `components/prompt/` - 프롬프트 입력 UI (빈 상태)
- `components/parameters/` - 생성 파라미터 UI (빈 상태)
- `components/modelExplorer/` - 모델 선택 UI (빈 상태)
- `core/stateManager.js` - 중앙 상태 관리 (빈 상태)

### Renewal Architecture Reference (참조용)

**renewal/ 폴더의 역할:**
- 🚨 **실제 구현 아님, 가이드 역할만**
- 각 컴포넌트 README.md에 상세 기능 명세 있음
- 향후 구현 시 API 표준 참고용

**예상 API 패턴** (renewal/ 문서 기준):
- **Component Init**: `export function init(containerElement)`
- **State Integration**: stateManager를 통한 pub/sub 패턴
- **Standard Methods**: `getXXX()`, `setXXX()`, `updateXXX()` 형태

### External Dependencies & Tools

**프론트엔드:**
- **Konva.js** (v9): 2D 캔버스 라이브러리 (CDN 로드)
- **live-server**: 개발 서버, 자동 리로드

**백엔드:**
- **Flask**: Web API 서버
- **torch**: PyTorch (Stable Diffusion)
- **opencv-python**: 이미지 처리
- **diffusers**: Hugging Face Diffusion 모델
- **transformers**: AI 모델 로더

**개발환경:**
- **Node.js**: 프론트엔드 개발 서버용
- **Python 3.8+**: 백엔드 AI 처리용
- **ComfyUI**: 모델 공유 (심볼릭 링크)

## 🏷️ 이미지 속성 시스템 (Image Type System)

### 현재 구현된 시스템

**기본 타입 구분:**
- `normal`: 사용자가 직접 업로드한 원본 이미지
- `preproc`: 전처리 시스템으로 생성된 이미지 (depth, edge, pose 등)

**이미지 노드 속성 구조:**
```javascript
// Konva.Image 노드에 저장되는 커스텀 속성들
{
    imageType: 'normal' | 'preproc',           // 이미지 타입
    processingSource: 'user' | 'preprocessing', // 처리 소스
    originalImageId: string,                    // 원본 이미지 ID (추적용)
    createdAt: ISO string,                      // 생성 시간
    processingParams: Object                    // 처리 파라미터
}
```

### 관련 함수 (`components/preprocessing/preprocessorManager.js`)

```javascript
// 이미지 타입 정보 가져오기
getImageTypeInfo(imageNode) -> Object

// 특정 타입의 모든 이미지 찾기
findImagesByType(imageType) -> Promise<Array>

// 원본에서 파생된 모든 전처리 이미지 찾기
findDerivedImages(originalImageNode) -> Array
```

### 향후 확장 가이드

**새로운 이미지 타입 추가 시:**

1. **타입 정의 확장**:
   ```javascript
   // 현재: 'normal' | 'preproc'
   // 확장 예시: 'normal' | 'preproc' | 'generated' | 'composite'
   ```

2. **속성 확장**:
   ```javascript
   // applyPreprocessedImageToCanvas 함수에서 새 속성 추가
   const processedImageNode = new Konva.Image({
       // ... 기존 속성들
       newAttribute: value,           // 새 속성
       metadata: additionalInfo       // 메타데이터
   });
   ```

3. **필터링 함수 확장**:
   ```javascript
   // 새로운 검색 조건 추가
   export function findImagesByMetadata(key, value) {
       // 구현
   }
   ```

**사용 예시:**
```javascript
// 현재 사용 방법
const typeInfo = getImageTypeInfo(selectedImage);
if (typeInfo.imageType === 'preproc') {
    console.log('전처리된 이미지입니다');
}

// 모든 전처리 이미지 찾기
const preprocImages = await findImagesByType('preproc');
```

**주의사항:**
- 이미지 속성은 Konva.Image 노드의 `attrs` 객체에 저장됩니다
- 캔버스 레이어에서 `layer.find('Image')` 로 모든 이미지에 접근 가능
- 속성 확장 시 기존 코드와의 호환성 유지가 중요합니다

## 🚀 Session Continuity & Background Server Management

### 백그라운드 서버 상태 확인 프로토콜
새로운 Claude Code 세션에서 작업할 때는 반드시 다음 순서로 확인:

#### 1. 시스템 리마인더에서 백그라운드 프로세스 확인
```
Background Bash 83746c (command: python -m backend.main) (status: running)
Background Bash 2736e1 (command: npm start) (status: running)
```

#### 2. BashOutput으로 서버 상태 및 포트 확인
```bash
# 백엔드 서버 확인
BashOutput(bash_id="83746c")  # 8080 포트 확인

# 프론트엔드 서버 확인  
BashOutput(bash_id="2736e1")  # 9000 포트 확인
```

#### 3. 서버 상태별 대응 방법

**✅ 정상 상태 (권장):**
- Backend: `Uvicorn running on http://127.0.0.1:8080`
- Frontend: `Serving "D:\Cube_Project\Cubestudio" at http://127.0.0.1:9000`
- **액션**: 기존 서버 그대로 사용, 새 서버 시작하지 말 것!

**⚠️ 포트 충돌 상태:**
- Frontend: `http://0.0.0.0:9000 is already in use. Trying another port.`
- **액션**: `./kill_ports.bat` 실행 후 깨끗하게 재시작

**❌ 서버 없음:**
- 백그라운드 프로세스 없거나 모두 killed 상태
- **액션**: 새로 시작

### 효율적인 세션 시작 체크리스트

```bash
# Step 1: 백그라운드 서버 상태 점검
BashOutput tool 사용해서 기존 서버들 확인

# Step 2-A: 서버가 올바른 포트에서 실행 중이면
echo "기존 서버 사용: Frontend(9000), Backend(8080)"
# 새 서버 시작하지 말고 바로 작업 진행

# Step 2-B: 포트 충돌이나 서버 없으면
./kill_ports.bat
python -m backend.main  # 백그라운드로
npm start              # 백그라운드로
```

### 포트 충돌 방지 가이드

**DO ✅:**
- 세션 시작 시 반드시 백그라운드 서버 확인
- 올바른 포트에서 실행 중이면 기존 서버 사용
- `BashOutput` 도구로 포트 정보 확인

**DON'T ❌:**
- 확인 없이 바로 `npm start` 실행
- 여러 개의 중복 서버 실행
- 포트 충돌 상황에서 계속 새 서버 시작

### 컨텍스트 이동 시 백그라운드 서버 정보 전달

**현재 활성 서버 (2025-09-10 기준):**
- **Backend ID**: `83746c` → http://127.0.0.1:8080
- **Frontend ID**: `2736e1` → http://127.0.0.1:9000

이 정보를 새 세션에서 우선 확인하여 불필요한 서버 재시작 방지할 것.