-- 직원 어학정보
CREATE TABLE IF NOT EXISTS employee_languages (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  acquisition_date DATE,
  language_code VARCHAR(50),
  test_type VARCHAR(50),
  score INTEGER,
  grade VARCHAR(50),
  expiry_date DATE
);

CREATE INDEX IF NOT EXISTS ix_employee_languages_employee_id ON employee_languages(employee_id);
CREATE INDEX IF NOT EXISTS ix_employee_languages_sort_order ON employee_languages(sort_order);
