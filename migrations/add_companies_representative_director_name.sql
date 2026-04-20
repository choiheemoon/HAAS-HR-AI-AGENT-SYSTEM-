-- 대표이사 성명 (회사 관리)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS representative_director_name VARCHAR(200);
