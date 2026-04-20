-- 급여처리유형(인사기준 employee_type) — employees에 코드·FK 저장 (삭제 가드용)

ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_process_type VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_process_type_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_salary_process_type_item_id
  ON employees(salary_process_type_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_salary_process_type_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_salary_process_type_item_id
      FOREIGN KEY (salary_process_type_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
