@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"

if exist venv (
    echo venv 폴더가 이미 있습니다.
    pause
    exit /b 0
)

echo Python 가상환경 생성 중...
python -m venv venv
call venv\Scripts\activate.bat
pip install --upgrade pip
echo.
echo 가상환경이 생성되었습니다. 이제 deploy\install.bat 을 실행하세요.
pause
