@echo off
setlocal enabledelayedexpansion
title E-Pro Trip Manager
color 1F

echo ============================================
echo   E-Pro Trip Manager + Call Logger + n8n
echo ============================================
echo.

:: ── 1. Start Docker Desktop if not running ──────────────────────────────────
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo [1/2] Starting Docker Desktop...
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
echo [1/2] Docker daemon is up.
echo.

:: ── 2. Start / restart n8n container ────────────────────────────────────────
echo [2/2] Starting n8n...
docker inspect n8n >nul 2>&1
if %errorlevel% equ 0 (
    docker start n8n >nul 2>&1
) else (
    docker volume create n8n_data >nul 2>&1
    docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n >nul 2>&1
)
echo     n8n ready at http://localhost:5678
echo.

echo ============================================
echo   Docker and n8n are running.
echo   Now open a terminal in this folder and
echo   run:  npm run dev
echo ============================================
echo.
pause
