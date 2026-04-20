@echo off
chcp 65001 >nul
setlocal
title HR AI Agent - Frontend

set "ROOT=%~dp0.."
cd /d "%ROOT%\frontend"

echo 프론트엔드 서버 시작 (http://localhost:3000)
echo 먼저 deploy\install.bat 으로 빌드가 되어 있어야 합니다.
echo 종료하려면 이 창을 닫으세요.
echo.
REM 외부 IP(예: 218.x) 접속 시 바인딩 명시 — start:host = next start -H 0.0.0.0
npm run start:host
pause
