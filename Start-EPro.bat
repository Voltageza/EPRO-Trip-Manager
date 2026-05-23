@echo off
setlocal enabledelayedexpansion
title E-Pro Launcher
color 1F

echo ============================================
echo   E-Pro Trip Manager + Call Logger + n8n
echo ============================================
echo.

:: ── 1. Start Docker Desktop if not running ──────────────────────────────────
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo [1/3] Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo     Waiting for Docker daemon (up to 120 s)...
set /a _wait=0

:wait_docker
timeout /t 5 /nobreak >nul
set /a _wait+=5
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready
if !_wait! geq 120 (
    echo     ERROR: Docker did not start in time. Aborting.
    pause
    exit /b 1
)
goto wait_docker

:docker_ready
echo [1/3] Docker daemon is up.
echo.

:: ── 2. Start / restart n8n container ────────────────────────────────────────
echo [2/3] Starting n8n on port 5678...

docker inspect n8n >nul 2>&1
if %errorlevel% equ 0 (
    docker start n8n >nul 2>&1
    echo     n8n container started (existing).
) else (
    docker volume create n8n_data >nul 2>&1
    docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n >nul 2>&1
    echo     n8n container created and started.
)
echo     n8n UI  : http://localhost:5678
echo.

:: ── 3. Start Node dev servers in a new window ────────────────────────────────
echo [3/3] Starting Trip Manager + Call Logger dev servers...
cd /d "%~dp0"
start "E-Pro Dev Servers" cmd /k "npm run dev"
echo     Server  : http://localhost:3001
echo     Client  : http://localhost:5173
echo     Calls   : http://localhost:5174/call-logger/
echo.

echo ============================================
echo   All services launched. You can close
echo   this window -- dev servers run separately.
echo ============================================
echo.
pause
