@echo off
echo Killing CUBE Studio processes on ports 9000, 9001, 9002, and 9003...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9000"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9000 (Frontend)
        taskkill /F /PID %%a
    )
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9001"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9001 (Legacy Backend)
        taskkill /F /PID %%a
    )
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9002"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9002 (Model Processor)
        taskkill /F /PID %%a
    )
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9003"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9003 (Unified Backend)
        taskkill /F /PID %%a
    )
)

echo.
echo All CUBE Studio processes have been terminated.
echo Done.
