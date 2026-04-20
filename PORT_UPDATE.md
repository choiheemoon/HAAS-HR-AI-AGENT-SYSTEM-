# 포트 변경 완료

## 변경 사항

PostgreSQL 서버가 **포트 5433**에서 실행 중이므로 모든 연결 설정을 업데이트했습니다.

## 수정된 파일

1. **app/config.py**
   - `DATABASE_URL`: 포트 5432 → 5433
   - `get_database_url()`: 포트 5432 → 5433, localhost → 127.0.0.1

2. **app/database.py**
   - `get_database_url()`: 포트 5432 → 5433
   - `create_connection_with_encoding()`: 포트 5432 → 5433

3. **test_db_connection.py**
   - 연결 문자열: 포트 5432 → 5433

4. **recreate_database.sql**
   - 주석에 포트 5433 명시

## 연결 테스트 결과

✅ **연결 성공!**
- 데이터베이스: AI_HR
- Encoding: UTF8
- Collation: C
- Character type: C
- Client encoding: UTF8

## 다음 단계

1. 서버가 정상적으로 실행 중인지 확인
2. 회원가입 테스트:
   - 브라우저: http://localhost:3000/register
   - 또는: `python test_register_encoding.py`

## 참고

PostgreSQL 18이 포트 5433에서 실행 중입니다. 이는 일반적인 설정이며, 여러 PostgreSQL 버전이 설치된 경우 포트가 다를 수 있습니다.
