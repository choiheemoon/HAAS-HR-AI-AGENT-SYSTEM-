@echo off
chcp 65001 >nul
echo ============================================================
echo PostgreSQL 서버 상태 확인
echo ============================================================
echo.

echo [1단계] PostgreSQL 서비스 확인...
sc query | findstr /i "postgresql"
echo.

echo [2단계] 포트 5432 확인...
netstat -an | findstr ":5432"
echo.

echo [3단계] PostgreSQL 프로세스 확인...
tasklist | findstr /i "postgres"
echo.

echo ============================================================
echo 확인 완료
echo ============================================================
echo.
echo PostgreSQL 서비스가 실행되지 않았다면:
echo   1. services.msc를 열고
echo   2. PostgreSQL 서비스를 찾아서
echo   3. 시작 또는 재시작하세요
echo.

pause
