-- 직원 가족사항 테이블 생성
-- psql -U postgres -d AI_HR -f migrations/add_employee_family.sql

CREATE TABLE IF NOT EXISTS employee_families (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(100),
  relation VARCHAR(50),
  resident_number VARCHAR(50),
  domestic_foreign VARCHAR(20),
  highest_education VARCHAR(100),
  occupation VARCHAR(100),
  workplace VARCHAR(200),
  position VARCHAR(100),
  support_reason VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS ix_employee_families_employee_id ON employee_families(employee_id);
CREATE INDEX IF NOT EXISTS ix_employee_families_sort_order ON employee_families(sort_order);

-- 내국인/외국 구분: 앱에서 domestic | foreign 만 사용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_employee_families_domestic_foreign'
  ) THEN
    ALTER TABLE employee_families
      ADD CONSTRAINT ck_employee_families_domestic_foreign
      CHECK (domestic_foreign IS NULL OR domestic_foreign IN ('domestic', 'foreign'));
  END IF;
END $$;
