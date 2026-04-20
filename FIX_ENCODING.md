# 인코딩 오류 해결 방법

## 문제 상황

회원가입 시 다음 오류가 발생합니다:
```
'utf-8' codec can't decode byte 0xb8 in position 63: invalid start byte
```

## 원인

PostgreSQL 데이터베이스 `AI_HR`의 Collation이 `Korean_Korea.949` (EUC-KR)로 설정되어 있어서, UTF-8 연결과 충돌이 발생합니다.

## 해결 방법

### 방법 1: 데이터베이스 Collation 변경 (권장)

pgAdmin 또는 psql에서 다음 SQL을 실행하세요:

```sql
-- 기존 데이터베이스 백업 (필요시)
-- pg_dump -U postgres -d AI_HR > backup.sql

-- 새 데이터베이스 생성 (UTF8 Collation)
CREATE DATABASE "AI_HR_UTF8"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0;

-- 기존 데이터베이스 삭제 (백업 후)
-- DROP DATABASE "AI_HR";

-- 새 데이터베이스 이름 변경
-- ALTER DATABASE "AI_HR_UTF8" RENAME TO "AI_HR";
```

또는 기존 데이터베이스를 삭제하고 다시 생성:

```sql
-- 주의: 모든 데이터가 삭제됩니다!
DROP DATABASE "AI_HR";

CREATE DATABASE "AI_HR"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0;
```

### 방법 2: 연결 문자열에 인코딩 명시

`app/config.py`에서 연결 문자열을 수정:

```python
DATABASE_URL: str = "postgresql://postgres:Atech123%21%40%23@localhost:5432/AI_HR?client_encoding=UTF8"
```

### 방법 3: 환경 변수 설정

PowerShell에서:

```powershell
$env:PGCLIENTENCODING='UTF8'
$env:PGCLIENTENCODING='SQL_ASCII'  # 또는 이렇게 시도
python run.py
```

## 현재 상태

- ✅ 서버는 정상적으로 시작됨
- ❌ 데이터베이스 연결 시 인코딩 오류 발생
- ⚠️ 회원가입 기능이 작동하지 않음

## 권장 조치

**가장 간단한 해결책**: pgAdmin에서 `AI_HR` 데이터베이스를 삭제하고, UTF8 Collation으로 다시 생성하세요.

1. pgAdmin 열기
2. `AI_HR` 데이터베이스 우클릭 → Delete/Drop
3. 새 데이터베이스 생성:
   - Name: `AI_HR`
   - Owner: `postgres`
   - Encoding: `UTF8`
   - Collation: `C` (또는 `en_US.UTF8`)
   - Character type: `C` (또는 `en_US.UTF8`)
4. 서버 재시작
