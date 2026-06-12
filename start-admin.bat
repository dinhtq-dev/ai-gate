@echo off
title AIGate Admin Server
cd /d "%~dp0"
echo ============================================
echo   AIGate Admin Server
echo   Starting on http://127.0.0.1:3000
echo   (Run as Administrator for DNS / MITM)
echo ============================================
echo.

:: Kiểm tra Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found! Please install Node.js first.
    pause
    exit /b 1
)

:: XMITM cạnh repo (..\xmitm) — dùng cho Start MITM + DNS Redirection
if exist "%~dp0..\xmitm\src\server.js" (
    set "XMITM_ROOT=%~dp0..\xmitm"
    echo [INFO] XMITM_ROOT=%XMITM_ROOT%
) else if exist "%~dp0xmitm\src\server.js" (
    set "XMITM_ROOT=%~dp0xmitm"
    echo [INFO] XMITM_ROOT=%XMITM_ROOT%
)

:: Kiểm tra node_modules
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo.
)

echo [INFO] Starting AIGate...
node src/core/master.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Server exited with code %ERRORLEVEL%
    pause
    exit /b 1
)
