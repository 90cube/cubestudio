@echo off
echo Starting CUBE Studio Unified Backend Service...
echo.

echo Checking for existing processes on ports...
netstat -ano | findstr :8080 >nul 2>&1
if %errorlevel%==0 (
    echo WARNING: Port 8080 is already in use. Backend may already be running.
)
netstat -ano | findstr :9000 >nul 2>&1
if %errorlevel%==0 (
    echo WARNING: Port 9000 is already in use. Frontend may already be running.
)
echo.

echo Starting Backend Server...
start "CUBE Backend" cmd /k "python unified_backend_service.py"
timeout /t 3 /nobreak >nul

echo Starting Frontend Server...
start "CUBE Frontend" cmd /k "npm start"

echo.
echo ========================================
echo CUBE Studio is starting:
echo - Backend API: http://localhost:8080
echo - Frontend: http://localhost:9000
echo ========================================
echo.
echo Press any key to exit this window...
pause >nul