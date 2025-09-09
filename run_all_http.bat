@echo off
echo Starting CUBE Studio Unified Backend Service...
echo Activating Python virtual environment...
start "Unified Backend" cmd /c "call .venv\Scripts\activate.bat && python -m backend.main"

echo Starting front-end server with http-server...
start "Frontend" cmd /c "http-server -p 9000 --cors"

echo.
echo CUBE Studio is starting:
echo - Backend API: http://localhost:8080
echo - Frontend: http://localhost:9000
