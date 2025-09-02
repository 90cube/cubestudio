@echo off
echo Killing processes on ports 9000 and 9001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9000"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9000
        taskkill /F /PID %%a
    )
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9001"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9001
        taskkill /F /PID %%a
    )
)
echo Done.
