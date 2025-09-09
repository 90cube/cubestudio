@echo off
echo Starting CUBE Studio Unified Backend Service...
echo Activating Python virtual environment...
call .venv\Scripts\activate.bat
start "Unified Backend" cmd /c "call .venv\Scripts\activate.bat && python unified_backend_service.py"

echo Starting front-end server...
start "Frontend" cmd /c "run_frontend.bat"

echo.
echo CUBE Studio is starting:
echo - Unified Backend: http://localhost:9003
echo - Frontend: http://localhost:9000
