-- parsed_applications 테이블에 Last Working 1~3, LW1~3 period 컬럼 추가
-- 실행: psql -U postgres -d AI_HR -f scripts/add_parsed_application_last_working.sql

ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_1 VARCHAR(300);
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw1_period VARCHAR(100);
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_2 VARCHAR(300);
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw2_period VARCHAR(100);
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_3 VARCHAR(300);
ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw3_period VARCHAR(100);
