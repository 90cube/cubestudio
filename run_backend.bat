@echo off
echo Starting CUBE Studio Backend Server (Port 8080)...
cd /d "%~dp0"
set PYTHONPATH=%cd%
call .venv\Scripts\activate.bat
python -m backend.main
