-- Major/Minor 코드 기준정보 테이블 생성

CREATE TABLE IF NOT EXISTS major_codes (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  major_code VARCHAR(50) NOT NULL,
  code_definition_type VARCHAR(30) NOT NULL DEFAULT 'User Defined',
  name_kor VARCHAR(300),
  name_eng VARCHAR(300),
  name_thai VARCHAR(300),
  note VARCHAR(1000),
  CONSTRAINT uq_major_codes_company_major_code UNIQUE (company_id, major_code),
  CONSTRAINT ck_major_codes_definition_type
    CHECK (code_definition_type IN ('User Defined', 'System Defined'))
);

CREATE INDEX IF NOT EXISTS ix_major_codes_company_id ON major_codes(company_id);
CREATE INDEX IF NOT EXISTS ix_major_codes_major_code ON major_codes(major_code);


CREATE TABLE IF NOT EXISTS minor_codes (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  major_code_id INTEGER NOT NULL REFERENCES major_codes(id) ON DELETE CASCADE,
  minor_code VARCHAR(50) NOT NULL,
  code_definition_type VARCHAR(30) NOT NULL DEFAULT 'User Defined',
  name_kor VARCHAR(300),
  name_eng VARCHAR(300),
  name_thai VARCHAR(300),
  note VARCHAR(1000),
  CONSTRAINT uq_minor_codes_company_major_minor_code
    UNIQUE (company_id, major_code_id, minor_code),
  CONSTRAINT ck_minor_codes_definition_type
    CHECK (code_definition_type IN ('User Defined', 'System Defined'))
);

CREATE INDEX IF NOT EXISTS ix_minor_codes_company_id ON minor_codes(company_id);
CREATE INDEX IF NOT EXISTS ix_minor_codes_major_code_id ON minor_codes(major_code_id);
CREATE INDEX IF NOT EXISTS ix_minor_codes_minor_code ON minor_codes(minor_code);

