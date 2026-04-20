-- employees: (company_id, category, code) 복합 FK 추가
-- employee_reference_items(company_id, category, code) 참조

ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_category VARCHAR(50) NOT NULL DEFAULT 'department';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_level_category VARCHAR(50) NOT NULL DEFAULT 'level';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_category VARCHAR(50) NOT NULL DEFAULT 'position';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type_category VARCHAR(50) NOT NULL DEFAULT 'employment_type';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_process_type_category VARCHAR(50) NOT NULL DEFAULT 'employee_type';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_category VARCHAR(50) NOT NULL DEFAULT 'division';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_place_category VARCHAR(50) NOT NULL DEFAULT 'work_place';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area_category VARCHAR(50) NOT NULL DEFAULT 'area';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_status_category VARCHAR(50) NOT NULL DEFAULT 'work_status';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_level_category VARCHAR(50) NOT NULL DEFAULT 'employee_level';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_department_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_department_category CHECK (department_category = 'department') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_job_level_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_job_level_category CHECK (job_level_category = 'level') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_position_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_position_category CHECK (position_category = 'position') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_employment_type_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_employment_type_category CHECK (employment_type_category = 'employment_type') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_salary_process_type_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_salary_process_type_category CHECK (salary_process_type_category = 'employee_type') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_division_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_division_category CHECK (division_category = 'division') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_work_place_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_work_place_category CHECK (work_place_category = 'work_place') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_area_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_area_category CHECK (area_category = 'area') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_work_status_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_work_status_category CHECK (work_status_category = 'work_status') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_employees_employee_level_category') THEN
    ALTER TABLE employees ADD CONSTRAINT ck_employees_employee_level_category CHECK (employee_level_category = 'employee_level') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_employees_department_code_ref ON employees(company_id, department_category, department);
CREATE INDEX IF NOT EXISTS ix_employees_job_level_code_ref ON employees(company_id, job_level_category, job_level);
CREATE INDEX IF NOT EXISTS ix_employees_position_code_ref ON employees(company_id, position_category, position);
CREATE INDEX IF NOT EXISTS ix_employees_employment_type_code_ref ON employees(company_id, employment_type_category, employment_type);
CREATE INDEX IF NOT EXISTS ix_employees_salary_process_type_code_ref ON employees(company_id, salary_process_type_category, salary_process_type);
CREATE INDEX IF NOT EXISTS ix_employees_division_code_ref ON employees(company_id, division_category, division);
CREATE INDEX IF NOT EXISTS ix_employees_work_place_code_ref ON employees(company_id, work_place_category, work_place);
CREATE INDEX IF NOT EXISTS ix_employees_area_code_ref ON employees(company_id, area_category, area);
CREATE INDEX IF NOT EXISTS ix_employees_work_status_code_ref ON employees(company_id, work_status_category, work_status);
CREATE INDEX IF NOT EXISTS ix_employees_employee_level_code_ref ON employees(company_id, employee_level_category, employee_level);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_department_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_department_code_ref
      FOREIGN KEY (company_id, department_category, department)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_job_level_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_job_level_code_ref
      FOREIGN KEY (company_id, job_level_category, job_level)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_position_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_position_code_ref
      FOREIGN KEY (company_id, position_category, position)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employment_type_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employment_type_code_ref
      FOREIGN KEY (company_id, employment_type_category, employment_type)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_salary_process_type_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_salary_process_type_code_ref
      FOREIGN KEY (company_id, salary_process_type_category, salary_process_type)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_division_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_division_code_ref
      FOREIGN KEY (company_id, division_category, division)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_place_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_place_code_ref
      FOREIGN KEY (company_id, work_place_category, work_place)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_area_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_area_code_ref
      FOREIGN KEY (company_id, area_category, area)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_status_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_status_code_ref
      FOREIGN KEY (company_id, work_status_category, work_status)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employee_level_code_ref') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employee_level_code_ref
      FOREIGN KEY (company_id, employee_level_category, employee_level)
      REFERENCES employee_reference_items(company_id, category, code)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
