# pgAdmin에서 데이터베이스 생성 가이드

## 오류 해결

pgAdmin에서 데이터베이스를 생성할 때 다음 오류가 발생할 수 있습니다:
```
새 데이터 정렬 규칙 (C)이 템플릿 데이터베이스의 데이터 정렬 규칙(Korean_Korea.949)과 호환되지 않음
```

## 해결 방법

### 1단계: 기존 데이터베이스 삭제

1. pgAdmin에서 `AI_HR` 데이터베이스 찾기
2. `AI_HR` 우클릭 → **Delete/Drop**
3. 확인: "Yes, drop it"

### 2단계: 새 데이터베이스 생성

1. **Databases** 우클릭 → **Create** → **Database**

2. **General 탭**:
   - **Name**: `AI_HR`

3. **Definition 탭** (중요!):
   - **Encoding**: `UTF8` 선택
   - **Template**: `template0` 선택 ⚠️ **반드시 template0!**
   - **Collation**: `C` 입력 또는 선택
   - **Character type**: `C` 입력 또는 선택
   - 나머지는 기본값 유지

4. **Owner**: `postgres` 선택

5. **Save** 클릭

### 중요 사항

- **Template을 `template0`으로 설정하지 않으면 오류 발생!**
- `template0`은 Collation이 없는 기본 템플릿이므로, 원하는 Collation으로 설정할 수 있습니다.
- `template1`은 기본적으로 `Korean_Korea.949` Collation을 사용하므로 사용하면 안 됩니다.

### 3단계: 확인

데이터베이스가 올바르게 생성되었는지 확인:

1. `AI_HR` 데이터베이스 우클릭 → **Properties**
2. **Definition 탭** 확인:
   - Encoding: `UTF8` ✅
   - Collation: `C` ✅
   - Character type: `C` ✅

### 4단계: 서버 재시작

```powershell
$env:PGCLIENTENCODING='UTF8'
python run.py
```

## 대안: SQL로 직접 실행

pgAdmin GUI에서 오류가 계속 발생하면, Query Tool에서 SQL을 직접 실행하세요:

```sql
-- 기존 데이터베이스 삭제
DROP DATABASE IF EXISTS "AI_HR";

-- UTF8 Collation으로 새로 생성 (template0 사용)
CREATE DATABASE "AI_HR"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0
    CONNECTION LIMIT = -1;
```

## 문제 해결

### 오류: "새 데이터 정렬 규칙이 템플릿과 호환되지 않음"
- **원인**: Template을 `template0`으로 설정하지 않음
- **해결**: Definition 탭에서 Template을 `template0`으로 변경

### 오류: "template0을 찾을 수 없음"
- **원인**: PostgreSQL 설치 문제
- **해결**: PostgreSQL을 재설치하거나, 다른 템플릿 사용 (권장하지 않음)
