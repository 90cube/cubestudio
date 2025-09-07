@echo off
echo Starting CUBE Studio Unified Backend Service...
echo Activating Python virtual environment...
start "Modular Backend" cmd /c "call .venv\Scripts\activate.bat && python -m backend.main_backend"

echo Starting front-end server with http-server...
start "Frontend" cmd /c "http-server -p 9000 --cors"

echo.
echo CUBE Studio is starting:
echo - Modular Backend: http://localhost:9004
- Frontend: http://localhost:9000
