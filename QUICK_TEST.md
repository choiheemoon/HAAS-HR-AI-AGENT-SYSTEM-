# 빠른 테스트 가이드

## PostgreSQL 연결 및 사용자 등록 테스트

### 1. 데이터베이스 생성 (필수)

PostgreSQL에 접속하여 데이터베이스를 생성하세요:

```sql
-- psql 또는 pgAdmin에서 실행
CREATE DATABASE "AI_HR"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8';
```

### 2. 서버 실행

```powershell
# 환경 변수 설정
$env:PGCLIENTENCODING='UTF8'

# 서버 실행
python run.py
```

### 3. 테이블 생성 확인

서버가 시작되면 자동으로 모든 테이블이 생성됩니다.

### 4. 회원가입 테스트

브라우저에서:
- http://localhost:3000/register 접속
- 회원가입 정보 입력
- 제출

또는 API 직접 테스트:
```bash
python test_api_register.py
```

## 문제 해결

인코딩 오류가 계속 발생하면:
1. PostgreSQL 서버 재시작
2. 데이터베이스 인코딩을 UTF8로 확인
3. 환경 변수 `PGCLIENTENCODING=UTF8` 설정
