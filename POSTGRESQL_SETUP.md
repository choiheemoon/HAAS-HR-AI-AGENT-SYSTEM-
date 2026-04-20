# PostgreSQL 데이터베이스 설정 가이드

## 데이터베이스 정보

- **서버**: localhost
- **포트**: 5432 (기본값)
- **사용자명**: postgres
- **비밀번호**: Atech123!@#
- **데이터베이스명**: AI_HR

## 설정 완료 사항

### 1. config.py 업데이트
`app/config.py` 파일의 `DATABASE_URL`이 PostgreSQL로 변경되었습니다:
```python
DATABASE_URL: str = "postgresql://postgres:Atech123%21%40%23@localhost:5432/AI_HR"
```

비밀번호의 특수문자는 URL 인코딩되어 있습니다:
- `!` = `%21`
- `@` = `%40`
- `#` = `%23`

### 2. 데이터베이스 생성

PostgreSQL에 데이터베이스를 생성해야 합니다:

```sql
-- PostgreSQL에 접속 (psql 또는 pgAdmin 사용)
CREATE DATABASE AI_HR
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Korean_Korea.949'
    LC_CTYPE = 'Korean_Korea.949'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;
```

또는 psql 명령줄에서:
```bash
psql -U postgres
CREATE DATABASE AI_HR;
\q
```

### 3. 테이블 생성

서버를 실행하면 자동으로 테이블이 생성됩니다:
```bash
python run.py
```

또는 Alembic 마이그레이션 사용:
```bash
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## 연결 테스트

```bash
python test_db_simple.py
```

## 환경 변수 사용 (선택사항)

`.env` 파일을 생성하여 설정을 관리할 수 있습니다:

```env
DATABASE_URL=postgresql://postgres:Atech123%21%40%23@localhost:5432/AI_HR
```

## 문제 해결

### 연결 실패 시

1. **PostgreSQL 서버 실행 확인**
   ```bash
   # Windows 서비스 확인
   services.msc
   # 또는
   pg_ctl status
   ```

2. **데이터베이스 존재 확인**
   ```sql
   \l  -- 데이터베이스 목록 확인
   ```

3. **사용자 권한 확인**
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE AI_HR TO postgres;
   ```

4. **포트 확인**
   - 기본 포트: 5432
   - 다른 포트 사용 시 URL에 포트 번호 명시

### 인코딩 문제

PostgreSQL 데이터베이스의 인코딩이 UTF-8인지 확인:
```sql
SHOW SERVER_ENCODING;
```

## 마이그레이션

SQLite에서 PostgreSQL로 데이터 마이그레이션이 필요한 경우:

1. SQLite 데이터 덤프
2. PostgreSQL 형식으로 변환
3. PostgreSQL에 임포트

또는 애플리케이션 레벨에서 데이터를 읽어서 새 데이터베이스에 쓰는 스크립트 작성
