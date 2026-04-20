-- 로그인 500 / UndefinedColumn permission_group_id 방지용 — ORM(users)과 DB 스키마 일치
-- 권장: pgAdmin에서 AI_HR DB 선택 후 본 스크립트 전체 실행 (IF NOT EXISTS 만 사용)
-- add_rbac_system.sql + add_user_company_access.sql 내용을 한 번에 적용합니다.

-- —— RBAC 코어 (add_rbac_system.sql) ——
CREATE TABLE IF NOT EXISTS permission_groups (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS ix_permission_groups_code ON permission_groups(code);

CREATE TABLE IF NOT EXISTS app_menus (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  menu_key VARCHAR(120) NOT NULL UNIQUE,
  label_key VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_menu_permissions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  permission_group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  app_menu_id INTEGER NOT NULL REFERENCES app_menus(id) ON DELETE CASCADE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_group_menu_permission UNIQUE (permission_group_id, app_menu_id)
);
CREATE INDEX IF NOT EXISTS ix_gmp_group ON group_menu_permissions(permission_group_id);
CREATE INDEX IF NOT EXISTS ix_gmp_menu ON group_menu_permissions(app_menu_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_group_id INTEGER
  REFERENCES permission_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_users_permission_group_id ON users(permission_group_id);

-- —— 시스템 관리 플래그 + 사용자별 회사 (add_user_company_access.sql) ——
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
