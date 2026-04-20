-- 직원 경력사항 테이블
-- psql -U postgres -d AI_HR -f migrations/add_employee_career.sql

CREATE TABLE IF NOT EXISTS employee_careers (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position_title VARCHAR(200),
  work_details TEXT,
  enter_date DATE,
  resigned_date DATE,
  company_name VARCHAR(300),
  address VARCHAR(500),
  telephone VARCHAR(50),
  begin_salary VARCHAR(100),
  resignation_reason TEXT,
  latest_salary VARCHAR(100),
  tenure_text VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS ix_employee_careers_employee_id ON employee_careers(employee_id);
CREATE INDEX IF NOT EXISTS ix_employee_careers_sort_order ON employee_careers(sort_order);
