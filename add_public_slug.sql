-- 채용 공고 웹 공개 URL용 public_slug 컬럼 추가
-- 실행 방법: psql -U postgres -d AI_HR -f add_public_slug.sql

ALTER TABLE job_postings
ADD COLUMN IF NOT EXISTS public_slug VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS ix_job_postings_public_slug ON job_postings (public_slug)
WHERE public_slug IS NOT NULL;
