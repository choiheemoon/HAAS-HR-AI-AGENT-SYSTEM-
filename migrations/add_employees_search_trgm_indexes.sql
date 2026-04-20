-- 인사마스터조회 검색 성능 개선(부분일치 ILIKE)용 trigram 인덱스
-- PostgreSQL 전용

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ix_employees_name_trgm
  ON employees USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_employees_employee_number_trgm
  ON employees USING gin (employee_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_employees_email_trgm
  ON employees USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_employees_department_trgm
  ON employees USING gin (department gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_employees_position_trgm
  ON employees USING gin (position gin_trgm_ops);
