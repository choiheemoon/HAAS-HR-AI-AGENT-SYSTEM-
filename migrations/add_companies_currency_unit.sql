-- 회사 통화 단위 (예: THB, KRW, USD)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS currency_unit VARCHAR(20);
