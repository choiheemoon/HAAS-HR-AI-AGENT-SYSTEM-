-- employee_certifications(자격증·면허) ↔ minor_codes(FK)
-- minor_codes 삭제를 ON DELETE RESTRICT로 막음

ALTER TABLE employee_certifications ADD COLUMN IF NOT EXISTS license_type_minor_code_id INTEGER;
ALTER TABLE employee_certifications ADD COLUMN IF NOT EXISTS issuer_minor_code_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employee_certifications_license_type_minor_code_id
  ON employee_certifications(license_type_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_certifications_issuer_minor_code_id
  ON employee_certifications(issuer_minor_code_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_certifications_license_type_minor_code_id') THEN
    ALTER TABLE employee_certifications
      ADD CONSTRAINT fk_employee_certifications_license_type_minor_code_id
      FOREIGN KEY (license_type_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_certifications_issuer_minor_code_id') THEN
    ALTER TABLE employee_certifications
      ADD CONSTRAINT fk_employee_certifications_issuer_minor_code_id
      FOREIGN KEY (issuer_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

