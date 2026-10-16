@echo off
rem One click start after a reboot: MySQL -> local API (port 4000) -> website (port 5173) -> browser.
title FitStack launcher
cd /d "%~dp0"

echo [1/4] Checking MySQL service...
sc query MySQL80 | find "RUNNING" >nul
if errorlevel 1 (
  echo       MySQL80 is not running. Starting it ^(asks for admin permission, click Yes^)...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '/c sc config MySQL80 start= auto & net start MySQL80'"
  sc query MySQL80 | find "RUNNING" >nul
  if errorlevel 1 (
    echo       Could not start MySQL80. Open services.msc, start MySQL80, then run this again.
    pause
    exit /b 1
  )
)
echo       MySQL is running.

echo [2/4] Checking packages...
if not exist node_modules ( call npm install )
if not exist frontend\node_modules ( call npm --prefix frontend install )

echo [3/4] Starting the API...
netstat -ano | find ":4000 " | find "LISTENING" >nul
if errorlevel 1 start "FitStack API (keep open)" cmd /k "cd /d %~dp0 && npm run api"
set /a tries=0
:waitapi
netstat -ano | find ":4000 " | find "LISTENING" >nul
if not errorlevel 1 goto apiup
set /a tries+=1
if %tries% geq 40 (
  echo       The API did not start. Look at the "FitStack API" window for the error.
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto waitapi
:apiup
echo       API is up on http://localhost:4000

echo [4/4] Starting the website...
netstat -ano | find ":5173 " | find "LISTENING" >nul
if errorlevel 1 start "FitStack website (keep open)" cmd /k "cd /d %~dp0frontend && npm run dev"
set /a tries=0
:waitweb
netstat -ano | find ":5173 " | find "LISTENING" >nul
if not errorlevel 1 goto webup
set /a tries+=1
if %tries% geq 40 goto webup
ping -n 2 127.0.0.1 >nul
goto waitweb
:webup
start "" http://localhost:5173
echo.
echo Done. Log in with your email + password, then the code 123456.
echo Close the two "keep open" windows when you are finished.
ping -n 6 127.0.0.1 >nul
