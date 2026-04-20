-- employees ↔ employee_reference_items 외래키 (PostgreSQL)
-- 적용 후 기동 시 db_schema_ensure와 동일 DDL이 중복 실행돼도 무해합니다.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_level_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_department_item_id ON employees(department_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_job_level_item_id ON employees(job_level_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_position_item_id ON employees(position_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_employment_type_item_id ON employees(employment_type_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_department_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_department_item_id
      FOREIGN KEY (department_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_job_level_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_job_level_item_id
      FOREIGN KEY (job_level_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_position_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_position_item_id
      FOREIGN KEY (position_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employment_type_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employment_type_item_id
      FOREIGN KEY (employment_type_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 기존 데이터: 코드 문자열이 기준정보와 일치하면 FK 채움(선택)
UPDATE employees e
SET department_item_id = r.id
FROM employee_reference_items r
WHERE e.company_id IS NOT NULL
  AND e.company_id = r.company_id
  AND r.category = 'department'
  AND TRIM(BOTH FROM COALESCE(e.department, '')) = TRIM(BOTH FROM r.code)
  AND e.department_item_id IS NULL;

UPDATE employees e
SET job_level_item_id = r.id
FROM employee_reference_items r
WHERE e.company_id IS NOT NULL
  AND e.company_id = r.company_id
  AND r.category = 'level'
  AND TRIM(BOTH FROM COALESCE(e.job_level, '')) = TRIM(BOTH FROM r.code)
  AND e.job_level_item_id IS NULL;

UPDATE employees e
SET position_item_id = r.id
FROM employee_reference_items r
WHERE e.company_id IS NOT NULL
  AND e.company_id = r.company_id
  AND r.category = 'position'
  AND TRIM(BOTH FROM COALESCE(e.position, '')) = TRIM(BOTH FROM r.code)
  AND e.position_item_id IS NULL;

UPDATE employees e
SET employment_type_item_id = r.id
FROM employee_reference_items r
WHERE e.company_id IS NOT NULL
  AND e.company_id = r.company_id
  AND r.category = 'employment_type'
  AND TRIM(BOTH FROM COALESCE(e.employment_type, '')) = TRIM(BOTH FROM r.code)
  AND e.employment_type_item_id IS NULL;
