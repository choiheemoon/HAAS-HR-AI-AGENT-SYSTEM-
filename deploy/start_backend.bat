@echo off
chcp 65001 >nul
setlocal
title HR AI Agent - Backend

set "ROOT=%~dp0.."
cd /d "%ROOT%"

if exist "venv\Scripts\activate.bat" call venv\Scripts\activate.bat

echo 백엔드 서버 시작 (http://0.0.0.0:8000)
echo 종료하려면 이 창을 닫으세요.
echo.
python run.py
pause
