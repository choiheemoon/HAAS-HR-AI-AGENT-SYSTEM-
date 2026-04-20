# 인코딩 오류 해결 방법

## 현재 문제

회원가입 시 다음 오류가 발생합니다:
```
'utf-8' codec can't decode byte 0xb8 in position 63: invalid start byte
```

## 원인

PostgreSQL 데이터베이스 `AI_HR`의 Collation이 `Korean_Korea.949` (EUC-KR)로 설정되어 있어서, UTF-8 연결과 충돌이 발생합니다.

## 해결 방법 (필수)

### pgAdmin에서 데이터베이스 재생성

1. **pgAdmin 열기**
2. **`AI_HR` 데이터베이스 삭제**
   - `AI_HR` 우클릭 → Delete/Drop
   - 확인: "Yes, drop it"
3. **새 데이터베이스 생성**
   - Databases 우클릭 → Create → Database
   - **General 탭:**
     - Name: `AI_HR`
   - **Definition 탭:**
     - Encoding: `UTF8` ✅
     - **Template: `template0`** ⚠️ **중요: 반드시 template0 선택!**
     - Collation: `C` ✅
     - Character type: `C` ✅
   - **Owner:** `postgres`
   - **Save** 클릭

**⚠️ 중요**: Template을 `template0`으로 설정하지 않으면 Collation 오류가 발생합니다!

### 또는 SQL로 직접 실행

```sql
-- 기존 데이터베이스 삭제 (주의: 모든 데이터 삭제됨!)
DROP DATABASE "AI_HR";

-- UTF8 Collation으로 새로 생성
CREATE DATABASE "AI_HR"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0;
```

## 데이터베이스 재생성 후

1. 서버 재시작:
   ```powershell
   $env:PGCLIENTENCODING='UTF8'
   python run.py
   ```

2. 회원가입 테스트:
   - 브라우저에서 http://localhost:3000/register 접속
   - 또는 `python test_register_encoding.py` 실행

## 참고

- 데이터베이스를 재생성하면 기존 데이터가 모두 삭제됩니다.
- 기존 데이터가 있다면 먼저 백업하세요:
  ```bash
  pg_dump -U postgres -d AI_HR > backup.sql
  ```
