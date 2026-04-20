@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0.."

echo 백엔드 서버를 새 창에서 시작합니다...
start "HR AI Agent - Backend" cmd /k "cd /d \"%ROOT%\" && (if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat) && python run.py"

timeout /t 3 /nobreak >nul

echo 프론트엔드 서버를 새 창에서 시작합니다...
start "HR AI Agent - Frontend" cmd /k "cd /d \"%ROOT%\frontend\" && npm run start:host"

echo.
echo 두 서버가 각각 창에서 실행 중입니다.
echo   - 백엔드: http://localhost:8000
echo   - 프론트: http://localhost:3000
echo 창을 닫으면 해당 서버가 종료됩니다.
pause
