@echo off
setlocal
title Streamline - RMIT Creative Team
cd /d "%~dp0"

REM Usage:
REM   launch.bat          -> development server (hot reload) on http://localhost:3000
REM   launch.bat prod     -> production build + server on http://localhost:3000
REM   launch.bat dev 4000 -> development server on a custom port

set MODE=%~1
if "%MODE%"=="" set MODE=dev
set PORT=%~2
if "%PORT%"=="" set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js was not found on PATH. Install Node 20+ from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [setup] Installing dependencies ^(first run^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [error] npm install failed.
    pause
    exit /b 1
  )
)

if /i "%MODE%"=="prod" (
  echo [build] Creating production build...
  call npm run build
  if errorlevel 1 (
    echo [error] Build failed.
    pause
    exit /b 1
  )
  echo [start] Production server on http://localhost:%PORT%
  start "" http://localhost:%PORT%/login
  call npm run start -- --port %PORT%
) else (
  echo [start] Development server on http://localhost:%PORT%
  echo         Sign in with a seeded account, e.g. danh@rmit.local ^(no password^).
  echo         Press Ctrl+C to stop.
  start "" http://localhost:%PORT%/login
  call npm run dev -- --port %PORT%
)

endlocal
