-- 기존 AI_HR DB에 학력 테이블·컬럼 추가 (create_all만으로는 컬럼 추가 안 됨)
-- psql -U postgres -d AI_HR -f migrations/add_employee_education.sql

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS education_activity_study TEXT,
  ADD COLUMN IF NOT EXISTS education_certificate TEXT;

CREATE TABLE IF NOT EXISTS employee_educations (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  degree VARCHAR(200),
  field_of_study VARCHAR(200),
  institution VARCHAR(200),
  nationality VARCHAR(100),
  from_year INTEGER,
  to_year INTEGER,
  grade VARCHAR(100),
  note TEXT,
  educational_qualification VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS ix_employee_educations_employee_id ON employee_educations(employee_id);

ALTER TABLE employee_educations
  ADD COLUMN IF NOT EXISTS from_date DATE,
  ADD COLUMN IF NOT EXISTS to_date DATE,
  ADD COLUMN IF NOT EXISTS degree_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS field_of_study_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS institution_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS nationality_minor_code_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employee_educations_degree_minor_code_id ON employee_educations(degree_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_educations_field_of_study_minor_code_id ON employee_educations(field_of_study_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_educations_institution_minor_code_id ON employee_educations(institution_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_educations_nationality_minor_code_id ON employee_educations(nationality_minor_code_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_degree_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_degree_minor_code_id
      FOREIGN KEY (degree_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_field_of_study_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_field_of_study_minor_code_id
      FOREIGN KEY (field_of_study_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_institution_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_institution_minor_code_id
      FOREIGN KEY (institution_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_nationality_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_nationality_minor_code_id
      FOREIGN KEY (nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
