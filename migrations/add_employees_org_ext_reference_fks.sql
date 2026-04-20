-- 본부·근무지·지역·근무상태·사원레벨 — 코드 + employee_reference_items FK

ALTER TABLE employees ADD COLUMN IF NOT EXISTS division VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_place VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_status VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_level VARCHAR(100);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_place_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_status_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_level_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_division_item_id ON employees(division_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_work_place_item_id ON employees(work_place_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_area_item_id ON employees(area_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_work_status_item_id ON employees(work_status_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_employee_level_item_id ON employees(employee_level_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_division_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_division_item_id
      FOREIGN KEY (division_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_place_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_place_item_id
      FOREIGN KEY (work_place_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_area_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_area_item_id
      FOREIGN KEY (area_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_status_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_status_item_id
      FOREIGN KEY (work_status_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employee_level_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employee_level_item_id
      FOREIGN KEY (employee_level_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
