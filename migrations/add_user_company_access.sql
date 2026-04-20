-- 사용자: 시스템 관리 콘솔 권한 플래그 + 사용자별 회사 접근
-- psql ... -f migrations/add_user_company_access.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_system BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.can_manage_system IS 'True when provisioned via /api/v1/system/users (or granted by admin). Required for system admin APIs.';

CREATE TABLE IF NOT EXISTS user_company_access (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_company_access_user_company UNIQUE (user_id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_user_company_access_user ON user_company_access(user_id);
CREATE INDEX IF NOT EXISTS ix_user_company_access_company ON user_company_access(company_id);

-- 최초 기존 관리자 계정에 콘솔 권한 부여 (환경에 맞게 id 조정)
-- UPDATE users SET can_manage_system = TRUE, is_superuser = TRUE WHERE id = 1;
