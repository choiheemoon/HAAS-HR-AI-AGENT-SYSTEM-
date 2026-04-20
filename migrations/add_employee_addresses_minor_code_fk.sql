-- employee_addresses(국적/zone/도시/시군구/동읍면/우편번호) ↔ minor_codes(FK)
-- minor_codes 삭제 시 ON DELETE RESTRICT로 막습니다.

ALTER TABLE employee_addresses
  ADD COLUMN IF NOT EXISTS perm_nationality_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS perm_zone_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS perm_province_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS perm_district_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS perm_sub_district_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS perm_postcode_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_nationality_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_zone_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_province_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_district_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_sub_district_minor_code_id INTEGER,
  ADD COLUMN IF NOT EXISTS curr_postcode_minor_code_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_nationality_minor_code_id
  ON employee_addresses(perm_nationality_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_zone_minor_code_id
  ON employee_addresses(perm_zone_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_province_minor_code_id
  ON employee_addresses(perm_province_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_district_minor_code_id
  ON employee_addresses(perm_district_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_sub_district_minor_code_id
  ON employee_addresses(perm_sub_district_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_postcode_minor_code_id
  ON employee_addresses(perm_postcode_minor_code_id);

CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_nationality_minor_code_id
  ON employee_addresses(curr_nationality_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_zone_minor_code_id
  ON employee_addresses(curr_zone_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_province_minor_code_id
  ON employee_addresses(curr_province_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_district_minor_code_id
  ON employee_addresses(curr_district_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_sub_district_minor_code_id
  ON employee_addresses(curr_sub_district_minor_code_id);
CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_postcode_minor_code_id
  ON employee_addresses(curr_postcode_minor_code_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_nationality_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_nationality_minor_code_id
      FOREIGN KEY (perm_nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_zone_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_zone_minor_code_id
      FOREIGN KEY (perm_zone_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_province_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_province_minor_code_id
      FOREIGN KEY (perm_province_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_district_minor_code_id
      FOREIGN KEY (perm_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_sub_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_sub_district_minor_code_id
      FOREIGN KEY (perm_sub_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_postcode_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_postcode_minor_code_id
      FOREIGN KEY (perm_postcode_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_nationality_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_nationality_minor_code_id
      FOREIGN KEY (curr_nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_zone_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_zone_minor_code_id
      FOREIGN KEY (curr_zone_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_province_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_province_minor_code_id
      FOREIGN KEY (curr_province_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_district_minor_code_id
      FOREIGN KEY (curr_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_sub_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_sub_district_minor_code_id
      FOREIGN KEY (curr_sub_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_postcode_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_postcode_minor_code_id
      FOREIGN KEY (curr_postcode_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;

