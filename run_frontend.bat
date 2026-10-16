@echo off
rem Starts the FitStack website (React + Vite) on http://localhost:5173
rem The local API must also be running (npm run api) or login will say "Could not reach the local API".
cd /d "%~dp0frontend"
if not exist node_modules (
  echo Installing frontend packages first time...
  call npm install
)
start "" http://localhost:5173
call npm run dev
pause
