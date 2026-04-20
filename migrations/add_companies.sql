-- 회사 마스터 테이블 (기존 DB용)
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_code VARCHAR(50) NOT NULL UNIQUE,
  name_thai VARCHAR(300),
  name_eng VARCHAR(300),
  logo_data_url TEXT,
  address_no VARCHAR(200),
  soi VARCHAR(200),
  road VARCHAR(200),
  tumbon VARCHAR(200),
  amphur VARCHAR(200),
  province VARCHAR(200),
  zip_code VARCHAR(20),
  email VARCHAR(255),
  phone VARCHAR(100),
  fax VARCHAR(100),
  additional_info TEXT,
  webperson_sort_order INTEGER NOT NULL DEFAULT 0,
  webperson_note TEXT
);
CREATE INDEX IF NOT EXISTS ix_companies_company_code ON companies(company_code);
