# CUBE Studio (큐브 스튜디오)

**CUBE Studio**는 포토샵과 같은 직관적인 편집 인터페이스와 강력한 AI 이미지 생성 기능을 결합한 **웹 기반 AI 그래픽 도구**입니다. 사용자는 레이어, 브러시, 텍스트 도구 등을 활용해 캔버스에서 자유롭게 작업하면서, 동시에 Stable Diffusion 기반의 AI 모델을 통해 실시간으로 이미지를 생성하고 변형할 수 있습니다.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow)

## ✨ 주요 기능

*   **전문적인 편집 UI:**
    *   자유롭게 이동 및 크기 조절이 가능한 플로팅 패널 시스템.
    *   포토샵 스타일의 **레이어 관리 시스템** (순서 변경, 가시성 토글, 블렌딩 모드).
    *   무한 캔버스 및 줌/팬 컨트롤.
*   **강력한 AI 생성:**
    *   WebSocket 기반의 실시간 이미지 생성 피드백.
    *   텍스트 프롬프트(Text-to-Image) 및 이미지 기반(Image-to-Image) 생성.
    *   **ControlNet 통합:** Canny, Depth, Pose(DWPose), SoftEdge 등 다양한 전처리 및 제어 기능.
*   **고급 AI 도구:**
    *   **Inpainting/Outpainting:** 마스크를 이용한 부분 수정 및 영역 확장.
    *   **AI Detailer:** YOLO 기반의 객체 감지(얼굴, 손 등)를 통한 자동 디테일 보정.
    *   **Upscaling:** 고해상도 변환 지원.
*   **크리에이티브 도구:**
    *   브러시/지우개 도구 (압력 감지 지원).
    *   텍스트 입력 및 폰트 지원.
    *   이미지 크롭 및 변형 도구.

## 🛠️ 기술 스택

### 백엔드 (Backend)
*   **언어:** Python 3.10+
*   **프레임워크:** FastAPI (비동기 API 처리)
*   **AI 코어:** PyTorch, Diffusers, Hugging Face
*   **기타:** OpenCV (영상 처리), WebSocket (실시간 통신)

### 프론트엔드 (Frontend)
*   **언어:** Modern JavaScript (ES6+)
*   **라이브러리:** Vanilla JS (프레임워크 의존성 최소화), Konva.js (캔버스 렌더링)
*   **서빙:** live-server (Node.js)

## 🚀 설치 및 실행 방법

### 필수 요구 사항
*   **Python 3.10** 이상
*   **Node.js** (프론트엔드 서버 실행용)
*   **NVIDIA GPU** (CUDA 지원 권장)

### 1. 프로젝트 설정

```bash
# 1. 저장소 클론
git clone https://github.com/90cube/cubestudio.git
cd cubestudio

# 2. 백엔드 가상환경 생성 및 패키지 설치
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 3. 프론트엔드 의존성 설치
npm install
```

### 2. 모델 파일 준비
`config.yaml`에 설정된 경로(기본값: `./models`)에 필요한 모델 파일들을 배치해야 합니다.
*   `models/checkpoints/`: Stable Diffusion 체크포인트 (.safetensors)
*   `models/loras/`: LoRA 파일
*   `models/controlnet/`: ControlNet 모델 파일

### 3. 실행

윈도우 환경에서는 제공된 배치 파일을 통해 간편하게 실행할 수 있습니다.

*   **전체 실행 (권장):** `run_all.bat` (백엔드와 프론트엔드를 동시에 실행)
*   **개별 실행:**
    *   백엔드: `run_backend.bat` (Port: 8080)
    *   프론트엔드: `run_frontend.bat` (Port: 9000)

브라우저에서 `http://127.0.0.1:9000`으로 접속하여 사용합니다.

## 📂 프로젝트 구조

```
Cubestudio/
├── .venv/                 # 파이썬 가상환경
├── backend/               # 백엔드 소스 코드
│   ├── api/               # API 라우트 핸들러
│   ├── models/            # 데이터 모델 및 설정
│   ├── services/          # 핵심 비즈니스 로직 (파이프라인 등)
│   └── main.py            # 백엔드 진입점
├── frontend/              # 프론트엔드 소스 코드
│   ├── components/        # UI 컴포넌트
│   ├── core/              # 핵심 애플리케이션 로직
│   └── assets/            # 정적 자원
├── models/                # AI 모델 저장소 (Git 제외됨)
├── output/                # 생성된 이미지 저장소
└── config.yaml            # 프로젝트 설정 파일
```

## 📝 라이선스

이 프로젝트는 개인 및 연구 목적으로 사용 가능합니다. 상업적 사용에 대해서는 별도의 문의가 필요할 수 있습니다.
