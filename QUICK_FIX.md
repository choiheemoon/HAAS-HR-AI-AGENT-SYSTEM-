# 빠른 해결 방법

## 현재 오류
```
'utf-8' codec can't decode byte 0xb8 in position 63: invalid start byte
```

## 해결 방법 (3가지)

### 방법 1: SQL 스크립트 실행 (가장 빠름)

1. **pgAdmin 열기**
2. **Query Tool 열기** (Tools → Query Tool)
3. **`recreate_database.sql` 파일 내용 복사하여 실행**

또는 명령줄에서:
```bash
psql -U postgres -f recreate_database.sql
```

### 방법 2: pgAdmin GUI 사용

1. **pgAdmin 열기**
2. **`AI_HR` 데이터베이스 삭제**
   - `AI_HR` 우클릭 → Delete/Drop
   - "Yes, drop it" 확인
3. **새 데이터베이스 생성**
   - Databases 우클릭 → Create → Database
   - **General 탭**: 
     - Name = `AI_HR`
   - **Definition 탭**: 
     - Encoding = `UTF8` ✅
     - **Template = `template0`** ⚠️ **중요: 반드시 template0 선택!**
     - Collation = `C` ✅
     - Character type = `C` ✅
   - **Owner**: `postgres`
   - **Save**

**⚠️ 중요**: Template을 `template0`으로 설정하지 않으면 Collation 오류가 발생합니다!

### 방법 3: 배치 파일 실행

```bash
recreate_database.bat
```

## 데이터베이스 재생성 후

1. **서버 재시작**:
   ```powershell
   $env:PGCLIENTENCODING='UTF8'
   python run.py
   ```

2. **회원가입 테스트**:
   - 브라우저: http://localhost:3000/register
   - 또는: `python test_register_encoding.py`

## 확인

데이터베이스가 올바르게 생성되었는지 확인:
```sql
SELECT 
    datname,
    pg_encoding_to_char(encoding) as encoding,
    datcollate,
    datctype
FROM pg_database
WHERE datname = 'AI_HR';
```

결과:
- `encoding` = `UTF8` ✅
- `datcollate` = `C` ✅
- `datctype` = `C` ✅
