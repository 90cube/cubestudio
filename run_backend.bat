@echo off
cd /d "%~dp0"
set PYTHONPATH=%cd%
python backend/main.py