# 서버 시작 가이드

## PostgreSQL 연결 문제 해결

현재 PostgreSQL 연결 시 인코딩 오류가 발생하고 있습니다.

## 해결 방법

### 방법 1: 배치 파일 사용

`start_server.bat` 파일을 더블클릭하여 실행하세요.

### 방법 2: PowerShell에서 실행

```powershell
# 환경 변수 설정
$env:PGCLIENTENCODING='UTF8'

# 서버 실행
cd "D:\1.Atechsolution repository\88.HR AI AGENT"
python run.py
```

### 방법 3: PostgreSQL 확인

1. **PostgreSQL 서버 실행 확인**
   ```powershell
   Get-Service | Where-Object {$_.Name -like "*postgresql*"}
   ```

2. **데이터베이스 생성 확인**
   ```sql
   -- psql에서 실행
   \l  -- 데이터베이스 목록 확인
   
   -- AI_HR 데이터베이스가 없으면 생성
   CREATE DATABASE "AI_HR" WITH ENCODING 'UTF8';
   ```

3. **연결 테스트**
   ```bash
   psql -U postgres -d AI_HR -h localhost
   ```

## 서버 실행 확인

서버가 시작되면:
- http://localhost:8000/health 접속하여 확인
- http://localhost:8000/docs 에서 Swagger UI 확인

## 회원가입 테스트

서버가 실행되면:
```bash
python test_register_final.py
```

또는 브라우저에서:
- http://localhost:3000/register 접속
- 회원가입 정보 입력 후 제출
