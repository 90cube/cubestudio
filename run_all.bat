@echo off
echo ========================================
echo   CUBE Studio - Starting Services
echo ========================================
echo.

echo [1/2] Starting Backend Server (Port 8080)...
echo Activating Python virtual environment...
call .venv\Scripts\activate.bat
start "CUBE Backend (8080)" cmd /c "call .venv\Scripts\activate.bat && python -m backend.main"

echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo.
echo [2/2] Starting Frontend Server (Port 9000)...
start "CUBE Frontend (9000)" cmd /c "run_frontend.bat"

echo.
echo ========================================
echo   CUBE Studio is running:
echo   - Backend API: http://127.0.0.1:8080
echo   - Frontend UI: http://127.0.0.1:9000
echo ========================================
echo.
echo Press any key to close this window...
pause >nul
