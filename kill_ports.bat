@echo off
echo Killing CUBE Studio processes on ports 8080 and 9000...

echo Checking port 8080 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 8080 (Backend)
        taskkill /F /PID %%a
    )
)

echo Checking port 9000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9000"') do (
    if "%%a" NEQ "0" (
        echo Killing process with PID %%a on port 9000 (Frontend)
        taskkill /F /PID %%a
    )
)

echo.
echo All CUBE Studio processes have been terminated.
echo Done.
