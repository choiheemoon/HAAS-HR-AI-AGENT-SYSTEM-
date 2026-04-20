-- RBAC / 시스템 관리 테이블 및 users.permission_group_id
-- psql -U postgres -d AI_HR -f migrations/add_rbac_system.sql

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
