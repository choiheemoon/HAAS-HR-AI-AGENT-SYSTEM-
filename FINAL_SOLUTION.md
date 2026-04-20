# 최종 해결 방법

## 문제 상황

데이터베이스 설정은 올바르게 되어 있지만 (`UTF8`, `C` Collation), 여전히 인코딩 오류가 발생합니다:
```
'utf-8' codec can't decode byte 0xb8 in position 63: invalid start byte
```

## 근본 원인

이 오류는 **psycopg2가 연결 문자열을 파싱할 때** 발생하는 것으로 보입니다. 데이터베이스 자체의 설정은 올바르지만, 연결 과정에서 인코딩 문제가 발생하고 있습니다.

## 해결 방법

### 방법 1: PostgreSQL 서버 재시작 (권장)

1. **PostgreSQL 서버 재시작**
   - Windows 서비스 관리자에서 PostgreSQL 서비스 재시작
   - 또는: `services.msc` → PostgreSQL 서비스 → 재시작

2. **모든 연결 종료 후 재시작**
   ```sql
   -- pgAdmin Query Tool에서 실행
   SELECT pg_terminate_backend(pg_stat_activity.pid)
   FROM pg_stat_activity
   WHERE pg_stat_activity.datname = 'AI_HR'
     AND pid <> pg_backend_pid();
   ```

3. **애플리케이션 서버 재시작**
   ```powershell
   $env:PGCLIENTENCODING='UTF8'
   python run.py
   ```

### 방법 2: 데이터베이스 완전 재생성

1. **모든 연결 종료**
   ```sql
   SELECT pg_terminate_backend(pg_stat_activity.pid)
   FROM pg_stat_activity
   WHERE pg_stat_activity.datname = 'AI_HR'
     AND pid <> pg_backend_pid();
   ```

2. **데이터베이스 삭제 및 재생성**
   ```sql
   DROP DATABASE IF EXISTS "AI_HR";
   
   CREATE DATABASE "AI_HR"
       WITH 
       OWNER = postgres
       ENCODING = 'UTF8'
       LC_COLLATE = 'C'
       LC_CTYPE = 'C'
       TEMPLATE = template0
       CONNECTION LIMIT = -1;
   ```

3. **서버 재시작**

### 방법 3: psycopg2 버전 확인 및 업그레이드

```bash
pip show psycopg2-binary
pip install --upgrade psycopg2-binary
```

### 방법 4: 환경 변수 설정 강화

PowerShell에서:
```powershell
$env:PGCLIENTENCODING='UTF8'
$env:PYTHONIOENCODING='utf-8'
$env:LC_ALL='C.UTF-8'
python run.py
```

또는 배치 파일 생성 (`start_server_utf8.bat`):
```batch
@echo off
chcp 65001 >nul
set PGCLIENTENCODING=UTF8
set PYTHONIOENCODING=utf-8
set LC_ALL=C.UTF-8
cd /d "D:\1.Atechsolution repository\88.HR AI AGENT"
python run.py
pause
```

## 확인 사항

1. **데이터베이스 설정 확인** (이미 완료됨):
   - Encoding: `UTF8` ✅
   - Collation: `C` ✅
   - Character type: `C` ✅

2. **PostgreSQL 서버 버전 확인**:
   ```sql
   SELECT version();
   ```

3. **활성 연결 확인**:
   ```sql
   SELECT * FROM pg_stat_activity WHERE datname = 'AI_HR';
   ```

## 다음 단계

1. PostgreSQL 서버 재시작
2. 모든 Python 프로세스 종료
3. 환경 변수 설정 후 서버 재시작
4. 회원가입 테스트

## 참고

- 이 오류는 데이터베이스 설정이 아닌 **연결 과정**에서 발생하는 문제입니다.
- PostgreSQL 서버 재시작이 가장 효과적인 해결 방법입니다.
- 기존 연결이 남아있으면 오류가 계속 발생할 수 있습니다.
