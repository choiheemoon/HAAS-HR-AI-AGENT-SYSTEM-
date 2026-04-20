@echo off
chcp 65001 >nul
title HR AI Agent - 서버 종료

echo 포트 8000(백엔드), 3000(프론트엔드) 사용 프로세스를 종료합니다.
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul && echo 백엔드(PID %%a) 종료
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul && echo 프론트엔드(PID %%a) 종료
)

echo.
echo 완료. (실행 중인 CMD 창을 닫아도 됩니다.)
pause
