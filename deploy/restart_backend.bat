@echo off
chcp 65001 >nul
title HR AI Agent - 백엔드 재시작
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart_backend.ps1"
pause
