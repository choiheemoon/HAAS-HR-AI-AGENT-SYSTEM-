@echo off
chcp 65001 >nul
setlocal
title HR AI Agent - 설치

set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo ============================================================
echo   HR AI Agent - Windows Server 배포 설치
echo ============================================================
echo.

echo [1/4] Python 가상환경 확인...
if exist "venv\Scripts\activate.bat" (
    echo 가상환경이 있습니다. 활성화합니다.
    call venv\Scripts\activate.bat
) else (
    echo 가상환경이 없습니다. 시스템 Python을 사용합니다.
    python --version 2>nul || (echo Python이 설치되어 있지 않습니다. Python 3.10+ 설치 후 다시 실행하세요. & exit /b 1)
)

echo.
echo [2/4] 백엔드 의존성 설치 (pip)...
pip install -r requirements.txt
if errorlevel 1 (echo pip 설치 실패. & exit /b 1)

echo.
echo [3/4] 프론트엔드 의존성 설치 (npm)...
cd frontend
call npm install
if errorlevel 1 (echo npm install 실패. & cd /d "%ROOT%" & exit /b 1)

echo.
echo [4/4] 프론트엔드 빌드...
call npm run build
if errorlevel 1 (echo npm run build 실패. & cd /d "%ROOT%" & exit /b 1)

cd /d "%ROOT%"
echo.
echo ============================================================
echo   설치가 완료되었습니다.
echo   배포: deploy\start_all.bat 실행
echo   또는: deploy\start_backend.bat, deploy\start_frontend.bat 각각 실행
echo ============================================================
pause
