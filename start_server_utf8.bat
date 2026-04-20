@echo off
chcp 65001 >nul
echo ============================================================
echo HR AI Agent System - UTF8 환경으로 서버 시작
echo ============================================================
echo.

REM 환경 변수 설정
set PGCLIENTENCODING=UTF8
set PYTHONIOENCODING=utf-8
set LC_ALL=C.UTF-8

echo 환경 변수 설정 완료:
echo   PGCLIENTENCODING=%PGCLIENTENCODING%
echo   PYTHONIOENCODING=%PYTHONIOENCODING%
echo   LC_ALL=%LC_ALL%
echo.

cd /d "D:\1.Atechsolution repository\88.HR AI AGENT"

echo 서버 시작 중...
echo.
python run.py

pause
