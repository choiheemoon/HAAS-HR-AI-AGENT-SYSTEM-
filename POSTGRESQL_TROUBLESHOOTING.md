# PostgreSQL 연결 문제 해결 가이드

## 현재 상황

PostgreSQL 연결 시 인코딩 오류가 발생하고 있습니다:
```
'utf-8' codec can't decode byte 0xb8 in position 63: invalid start byte
```

## 해결 방법

### 1. PostgreSQL 서버 확인

PostgreSQL 서버가 실행 중인지 확인:
```powershell
# Windows 서비스 확인
Get-Service | Where-Object {$_.Name -like "*postgresql*"}
```

또는:
```sql
-- psql에서 확인
SELECT version();
```

### 2. 데이터베이스 생성 확인

데이터베이스 `AI_HR`가 생성되었는지 확인:
```sql
-- psql에서 실행
\l  -- 데이터베이스 목록 확인

-- 또는
SELECT datname FROM pg_database WHERE datname = 'AI_HR';
```

데이터베이스가 없으면 생성:
```sql
CREATE DATABASE AI_HR
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Korean_Korea.949'
    LC_CTYPE = 'Korean_Korea.949';
```

### 3. 연결 테스트 (psql 사용)

명령줄에서 직접 연결 테스트:
```bash
psql -U postgres -d AI_HR -h localhost -p 5432
```

비밀번호 입력: `Atech123!@#`

### 4. 환경 변수 설정

PowerShell에서 실행:
```powershell
$env:PGCLIENTENCODING='UTF8'
python run.py
```

### 5. 대안: .env 파일 사용

프로젝트 루트에 `.env` 파일 생성:
```env
DATABASE_URL=postgresql://postgres:Atech123%21%40%23@localhost:5432/AI_HR
PGCLIENTENCODING=UTF8
```

## 현재 설정

- **호스트**: localhost
- **포트**: 5432
- **데이터베이스**: AI_HR
- **사용자**: postgres
- **비밀번호**: Atech123!@# (URL 인코딩: Atech123%21%40%23)

## 다음 단계

1. PostgreSQL 서버 실행 확인
2. 데이터베이스 `AI_HR` 생성 확인
3. 환경 변수 `PGCLIENTENCODING=UTF8` 설정
4. 서버 재시작
