@echo off
echo 🎛️  ControlNet 전처리기 백엔드 서버 시작...
echo.

REM Python 가상환경 활성화 (있다면)
if exist venv\Scripts\activate.bat (
    echo 📦 가상환경 활성화 중...
    call venv\Scripts\activate.bat
)

REM 필요한 패키지 설치 확인
echo 📦 필요한 패키지 설치 중...
pip install -r requirements.txt

echo.
echo 🚀 서버 시작...
echo 📍 주소: http://localhost:5000
echo 🔧 API: /api/preprocessors, /api/preprocess, /api/health
echo.

REM Python 서버 실행
python preprocess_server.py

pause