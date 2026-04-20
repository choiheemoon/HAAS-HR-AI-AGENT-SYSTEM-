-- PostgreSQL 데이터베이스 재생성 스크립트
-- 인코딩 오류 해결을 위해 UTF8 Collation으로 재생성

-- 주의: 이 스크립트는 기존 데이터베이스를 삭제하고 새로 생성합니다.
-- 기존 데이터가 있다면 먼저 백업하세요:
-- pg_dump -U postgres -d AI_HR > backup.sql

-- 1. 기존 데이터베이스 삭제 (활성 연결이 있으면 실패할 수 있음)
-- 먼저 모든 연결을 종료해야 합니다
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'AI_HR'
  AND pid <> pg_backend_pid();

-- 2. 데이터베이스 삭제
DROP DATABASE IF EXISTS "AI_HR";

-- 3. UTF8 Collation으로 새 데이터베이스 생성
-- 중요: TEMPLATE = template0을 사용해야 다른 Collation으로 생성 가능
-- 포트: 5433 (PostgreSQL 18 기본 포트)
CREATE DATABASE "AI_HR"
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'C'
    LC_CTYPE = 'C'
    TEMPLATE = template0  -- 필수: template0을 사용해야 C Collation 설정 가능
    CONNECTION LIMIT = -1;

-- 4. 데이터베이스 정보 확인
SELECT 
    datname,
    pg_encoding_to_char(encoding) as encoding,
    datcollate,
    datctype
FROM pg_database
WHERE datname = 'AI_HR';
