-- 직원이 소속된 회사(company_id)는 삭제 불가 → ON DELETE RESTRICT
-- 기존 ON DELETE SET NULL 제약을 교체합니다.

DO $$
DECLARE cname text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_company_id_companies'
  ) THEN
    FOR cname IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'employees'
        AND kcu.column_name = 'company_id'
    LOOP
      EXECUTE format('ALTER TABLE employees DROP CONSTRAINT %I', cname);
    END LOOP;
    ALTER TABLE employees
      ADD CONSTRAINT fk_employees_company_id_companies
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
END $$;
