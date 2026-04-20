@echo off
chcp 65001 >nul
echo ============================================================
echo PostgreSQL 데이터베이스 재생성 스크립트
echo ============================================================
echo.
echo 주의: 이 스크립트는 AI_HR 데이터베이스를 삭제하고 재생성합니다.
echo 기존 데이터가 모두 삭제됩니다!
echo.
pause

echo.
echo PostgreSQL에 연결 중...
psql -U postgres -f recreate_database.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo 데이터베이스 재생성 완료!
    echo ============================================================
    echo.
    echo 이제 서버를 재시작하세요:
    echo   python run.py
) else (
    echo.
    echo ============================================================
    echo 오류 발생!
    echo ============================================================
    echo.
    echo 수동으로 실행하려면:
    echo   1. pgAdmin을 열고
    echo   2. AI_HR 데이터베이스를 삭제한 후
    echo   3. UTF8 Collation으로 새로 생성하세요.
    echo.
    echo 자세한 내용은 SOLUTION_ENCODING.md 파일을 참고하세요.
)

pause
