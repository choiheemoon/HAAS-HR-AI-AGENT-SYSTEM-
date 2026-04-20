-- 직원 자격증·면허
CREATE TABLE IF NOT EXISTS employee_certifications (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  license_code VARCHAR(50),
  license_type_name VARCHAR(300),
  grade VARCHAR(100),
  issuer_code VARCHAR(50),
  issuer_name VARCHAR(300),
  acquired_date DATE,
  effective_date DATE,
  next_renewal_date DATE,
  certificate_number VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS ix_employee_certifications_employee_id ON employee_certifications(employee_id);
CREATE INDEX IF NOT EXISTS ix_employee_certifications_sort_order ON employee_certifications(sort_order);
