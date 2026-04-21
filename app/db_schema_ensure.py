"""
PostgreSQL: users / RBAC 관련 누락 컬럼·테이블을 기동 시 보정합니다.
create_all()은 기존 테이블에 컬럼을 추가하지 않으므로, 수동 마이그레이션을
실행하지 않은 환경에서 로그인 500(UndefinedColumn)을 방지합니다.
"""
from sqlalchemy import text
from sqlalchemy.engine import Engine


def _run_ddl(engine: Engine, sql: str, label: str) -> None:
    try:
        with engine.begin() as conn:
            conn.execute(text(sql.strip()))
    except Exception as e:
        print(f"⚠️ 스키마 DDL 실패 ({label}): {e}")


def ensure_attendance_performance_indexes(engine: Engine) -> None:
    """create_all 이후 호출: 기간+정렬 기반 대량 조회용 인덱스(기존 DB 보강)."""
    if engine.dialect.name != "postgresql":
        return
    _run_ddl(
        engine,
        "CREATE INDEX IF NOT EXISTS ix_attendance_time_day_work_row_id "
        "ON attendance_time_day (work_day, row_no, id)",
        "ix_attendance_time_day_work_row_id",
    )


def ensure_postgresql_auth_schema(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    core_sql = [
        (
            "permission_groups",
            """
CREATE TABLE IF NOT EXISTS permission_groups (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  system_group_code VARCHAR(50) NOT NULL DEFAULT 'DEFAULT',
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_permission_groups_group_code UNIQUE (system_group_code, code)
)
""",
        ),
        (
            "ix_permission_groups_group_code",
            "CREATE INDEX IF NOT EXISTS ix_permission_groups_group_code ON permission_groups(system_group_code, code)",
        ),
        (
            "app_menus",
            """
CREATE TABLE IF NOT EXISTS app_menus (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  menu_key VARCHAR(120) NOT NULL UNIQUE,
  label_key VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
)
""",
        ),
        (
            "group_menu_permissions",
            """
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
)
""",
        ),
        (
            "ix_gmp_group",
            "CREATE INDEX IF NOT EXISTS ix_gmp_group ON group_menu_permissions(permission_group_id)",
        ),
        (
            "ix_gmp_menu",
            "CREATE INDEX IF NOT EXISTS ix_gmp_menu ON group_menu_permissions(app_menu_id)",
        ),
        (
            "users.system_group_code",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS system_group_code VARCHAR(50)",
        ),
        (
            "users.system_group_code_fill",
            "UPDATE users SET system_group_code = 'DEFAULT' WHERE system_group_code IS NULL OR TRIM(system_group_code) = ''",
        ),
        (
            "users.system_group_code_not_null",
            "ALTER TABLE users ALTER COLUMN system_group_code SET NOT NULL",
        ),
        (
            "ix_users_system_group_code",
            "CREATE INDEX IF NOT EXISTS ix_users_system_group_code ON users(system_group_code)",
        ),
        (
            "users_drop_unique_username",
            """
DO $$
DECLARE v_name text;
BEGIN
  SELECT tc.constraint_name INTO v_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name='users'
    AND tc.table_schema='public'
    AND tc.constraint_type='UNIQUE'
    AND kcu.column_name='username'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
""",
        ),
        (
            "users_drop_unique_index_ix_users_username",
            "DROP INDEX IF EXISTS ix_users_username",
        ),
        (
            "ix_users_username",
            "CREATE INDEX IF NOT EXISTS ix_users_username ON users(username)",
        ),
        (
            "users_drop_unique_group_username_index",
            "DROP INDEX IF EXISTS uq_users_group_username",
        ),
        (
            "users.permission_group_id",
            """
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_group_id INTEGER
  REFERENCES permission_groups(id) ON DELETE SET NULL
""",
        ),
        (
            "ix_users_permission_group_id",
            "CREATE INDEX IF NOT EXISTS ix_users_permission_group_id ON users(permission_group_id)",
        ),
        (
            "users.can_manage_system",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_system BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        (
            "users.is_superuser",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        (
            "users.last_login",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP",
        ),
    ]

    print("📋 PostgreSQL 인증/RBAC 스키마 보정 실행 중…")
    for label, sql in core_sql:
        _run_ddl(engine, sql, label)

    _run_ddl(
        engine,
        "COMMENT ON COLUMN users.can_manage_system IS "
        "'System admin UI; provisioned via /api/v1/system/users or DB.'",
        "comment can_manage_system",
    )

    # 직원 사진 경로 — companies 분기·후속 DDL 실패와 무관하게 최대한 일찍 적용
    _run_ddl(
        engine,
        "ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_path VARCHAR(512)",
        "employees_photo_path",
    )

    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'companies'
                """
            )
        ).first()

    if not row:
        print("⚠️ companies 테이블 없음 — user_company_access 생성은 건너뜁니다.")
        return

    # —— companies(회사명) ——
    _run_ddl(
        engine,
        """
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS system_group_code VARCHAR(50)
""",
        "companies_system_group_code",
    )
    _run_ddl(
        engine,
        "UPDATE companies SET system_group_code = 'DEFAULT' WHERE system_group_code IS NULL OR TRIM(system_group_code) = ''",
        "companies_system_group_code_fill",
    )
    _run_ddl(
        engine,
        "ALTER TABLE companies ALTER COLUMN system_group_code SET NOT NULL",
        "companies_system_group_code_not_null",
    )
    _run_ddl(
        engine,
        """
DO $$
DECLARE v_name text;
BEGIN
  SELECT tc.constraint_name INTO v_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name='companies'
    AND tc.table_schema='public'
    AND tc.constraint_type='UNIQUE'
    AND kcu.column_name='company_code'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.companies DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
""",
        "companies_drop_unique_company_code",
    )
    _run_ddl(
        engine,
        """
DO $$
DECLARE v_is_unique boolean;
BEGIN
  SELECT i.indisunique INTO v_is_unique
  FROM pg_class c
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'ix_companies_company_code'
    AND n.nspname = 'public'
  LIMIT 1;

  IF COALESCE(v_is_unique, false) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.ix_companies_company_code';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_companies_company_code ON public.companies(company_code)';
  END IF;
END $$;
""",
        "companies_fix_unique_ix_company_code",
    )
    _run_ddl(
        engine,
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_group_company_code ON companies(system_group_code, company_code)",
        "uq_companies_group_company_code",
    )
    _run_ddl(
        engine,
        "CREATE INDEX IF NOT EXISTS ix_companies_system_group_code ON companies(system_group_code)",
        "ix_companies_system_group_code",
    )
    _run_ddl(
        engine,
        """
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS name_kor VARCHAR(300)
""",
        "companies_name_kor",
    )
    _run_ddl(
        engine,
        """
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS representative_director_name VARCHAR(200)
""",
        "companies_representative_director_name",
    )
    _run_ddl(
        engine,
        """
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS currency_unit VARCHAR(20)
""",
        "companies_currency_unit",
    )

    _run_ddl(
        engine,
        "ALTER TABLE permission_groups ADD COLUMN IF NOT EXISTS system_group_code VARCHAR(50)",
        "permission_groups_system_group_code",
    )
    _run_ddl(
        engine,
        "UPDATE permission_groups SET system_group_code='DEFAULT' WHERE system_group_code IS NULL OR TRIM(system_group_code)=''",
        "permission_groups_system_group_code_fill",
    )
    _run_ddl(
        engine,
        "ALTER TABLE permission_groups ALTER COLUMN system_group_code SET NOT NULL",
        "permission_groups_system_group_code_not_null",
    )
    _run_ddl(
        engine,
        """
DO $$
DECLARE v_name text;
BEGIN
  SELECT tc.constraint_name INTO v_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name='permission_groups'
    AND tc.table_schema='public'
    AND tc.constraint_type='UNIQUE'
    AND kcu.column_name='code'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.permission_groups DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
""",
        "permission_groups_drop_unique_code",
    )
    _run_ddl(
        engine,
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_permission_groups_group_code ON permission_groups(system_group_code, code)",
        "uq_permission_groups_group_code",
    )

    for label, sql in [
        (
            "user_company_access",
            """
CREATE TABLE IF NOT EXISTS user_company_access (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_company_access_user_company UNIQUE (user_id, company_id)
)
""",
        ),
        (
            "ix_user_company_access_user",
            "CREATE INDEX IF NOT EXISTS ix_user_company_access_user ON user_company_access(user_id)",
        ),
        (
            "ix_user_company_access_company",
            "CREATE INDEX IF NOT EXISTS ix_user_company_access_company ON user_company_access(company_id)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_types(회사별 급여형태) ——
    for label, sql in [
        (
            "employee_types_table",
            """
CREATE TABLE IF NOT EXISTS employee_types (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_type_code VARCHAR(50) NOT NULL,
  name_kor VARCHAR(300),
  name_eng VARCHAR(300),
  name_thai VARCHAR(300),
  CONSTRAINT uq_employee_types_company_employee_type_code UNIQUE (company_id, employee_type_code)
);
""",
        ),
        (
            "ix_employee_types_company_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_types_company_id ON employee_types(company_id)",
        ),
        (
            "ix_employee_types_code",
            "CREATE INDEX IF NOT EXISTS ix_employee_types_code ON employee_types(employee_type_code)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_reference_items(회사별 인사기준정보) ——
    _run_ddl(
        engine,
        """
CREATE TABLE IF NOT EXISTS employee_reference_items (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name_kor VARCHAR(300),
  name_eng VARCHAR(300),
  name_thai VARCHAR(300),
  CONSTRAINT uq_employee_reference_items_company_category_code
    UNIQUE (company_id, category, code)
);
""",
        "employee_reference_items_table",
    )
    _run_ddl(
        engine,
        "CREATE INDEX IF NOT EXISTS ix_employee_reference_items_company_id ON employee_reference_items(company_id)",
        "ix_employee_reference_items_company_id",
    )
    _run_ddl(
        engine,
        "CREATE INDEX IF NOT EXISTS ix_employee_reference_items_category ON employee_reference_items(category)",
        "ix_employee_reference_items_category",
    )

    # —— major_codes / minor_codes (기준정보관리) ——
    for label, sql in [
        (
            "major_codes_table",
            """
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
""",
        ),
        (
            "ix_major_codes_company_id",
            "CREATE INDEX IF NOT EXISTS ix_major_codes_company_id ON major_codes(company_id)",
        ),
        (
            "ix_major_codes_major_code",
            "CREATE INDEX IF NOT EXISTS ix_major_codes_major_code ON major_codes(major_code)",
        ),
        (
            "minor_codes_table",
            """
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
""",
        ),
        (
            "ix_minor_codes_company_id",
            "CREATE INDEX IF NOT EXISTS ix_minor_codes_company_id ON minor_codes(company_id)",
        ),
        (
            "ix_minor_codes_major_code_id",
            "CREATE INDEX IF NOT EXISTS ix_minor_codes_major_code_id ON minor_codes(major_code_id)",
        ),
        (
            "ix_minor_codes_minor_code",
            "CREATE INDEX IF NOT EXISTS ix_minor_codes_minor_code ON minor_codes(minor_code)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employees(회사/사번) ——
    # 요구사항: 회사별 사번 중복 금지
    for label, sql in [
        (
            "employees_company_id",
            """
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id INTEGER
  REFERENCES companies(id) ON DELETE RESTRICT
""",
        ),
        (
            "drop_unique_employee_number",
            """
DO $$
DECLARE v_name text;
BEGIN
  SELECT tc.constraint_name INTO v_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name='employees'
    AND tc.table_schema='public'
    AND tc.constraint_type='UNIQUE'
    AND kcu.column_name='employee_number'
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.employees DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
""",
        ),
        (
            "uq_employees_company_employee_number",
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_company_employee_number ON employees(company_id, employee_number)",
        ),
        (
            "ix_employees_company_id",
            "CREATE INDEX IF NOT EXISTS ix_employees_company_id ON employees(company_id)",
        ),
        (
            "employees_list_query_indexes",
            """
CREATE INDEX IF NOT EXISTS ix_employees_company_status_id_desc
  ON employees(company_id, status, id DESC);
CREATE INDEX IF NOT EXISTS ix_employees_company_id_id_desc
  ON employees(company_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_employees_status_id_desc
  ON employees(status, id DESC);
""",
        ),
        (
            "employees_search_trgm_indexes",
            """
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
""",
        ),
        (
            "employees_education_activity_study",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS education_activity_study TEXT",
        ),
        (
            "employees_education_certificate",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS education_certificate TEXT",
        ),
        (
            "employees_reference_item_fk_cols",
            """
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_level_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_department_item_id ON employees(department_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_job_level_item_id ON employees(job_level_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_position_item_id ON employees(position_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_employment_type_item_id ON employees(employment_type_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_department_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_department_item_id
      FOREIGN KEY (department_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_job_level_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_job_level_item_id
      FOREIGN KEY (job_level_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_position_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_position_item_id
      FOREIGN KEY (position_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employment_type_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employment_type_item_id
      FOREIGN KEY (employment_type_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employees_salary_process_type",
            """
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_process_type VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_process_type_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_salary_process_type_item_id
  ON employees(salary_process_type_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_salary_process_type_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_salary_process_type_item_id
      FOREIGN KEY (salary_process_type_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employees_org_ext_reference_fks",
            """
ALTER TABLE employees ADD COLUMN IF NOT EXISTS division VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_place VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_status VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_level VARCHAR(100);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS division_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_place_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_status_item_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_level_item_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_employees_division_item_id ON employees(division_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_work_place_item_id ON employees(work_place_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_area_item_id ON employees(area_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_work_status_item_id ON employees(work_status_item_id);
CREATE INDEX IF NOT EXISTS ix_employees_employee_level_item_id ON employees(employee_level_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_division_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_division_item_id
      FOREIGN KEY (division_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_place_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_place_item_id
      FOREIGN KEY (work_place_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_area_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_area_item_id
      FOREIGN KEY (area_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_work_status_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_work_status_item_id
      FOREIGN KEY (work_status_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employees_employee_level_item_id') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_employee_level_item_id
      FOREIGN KEY (employee_level_item_id) REFERENCES employee_reference_items(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employees_swipe_card",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS swipe_card VARCHAR(100)",
        ),
        (
            "employees_company_id_fk_restrict",
            """
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
""",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_families (가족사항) —— 
    for label, sql in [
        (
            "employee_families_table",
            """
CREATE TABLE IF NOT EXISTS employee_families (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(100),
  relation VARCHAR(50),
  resident_number VARCHAR(50),
  domestic_foreign VARCHAR(20),
  highest_education VARCHAR(100),
  occupation VARCHAR(100),
  workplace VARCHAR(200),
  position VARCHAR(100),
  support_reason VARCHAR(200)
);
""",
        ),
        (
            "ix_employee_families_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_families_employee_id ON employee_families(employee_id)",
        ),
        (
            "ix_employee_families_sort_order",
            "CREATE INDEX IF NOT EXISTS ix_employee_families_sort_order ON employee_families(sort_order)",
        ),
        (
            "ck_employee_families_domestic_foreign",
            """
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_employee_families_domestic_foreign'
  ) THEN
    ALTER TABLE employee_families
      ADD CONSTRAINT ck_employee_families_domestic_foreign
      CHECK (domestic_foreign IS NULL OR domestic_foreign IN ('domestic', 'foreign'));
  END IF;
END $$;
""",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_careers (경력사항) ——
    for label, sql in [
        (
            "employee_careers_table",
            """
CREATE TABLE IF NOT EXISTS employee_careers (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position_title VARCHAR(200),
  work_details TEXT,
  enter_date DATE,
  resigned_date DATE,
  company_name VARCHAR(300),
  address VARCHAR(500),
  telephone VARCHAR(50),
  begin_salary VARCHAR(100),
  resignation_reason TEXT,
  latest_salary VARCHAR(100),
  tenure_text VARCHAR(100)
);
""",
        ),
        (
            "ix_employee_careers_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_careers_employee_id ON employee_careers(employee_id)",
        ),
        (
            "ix_employee_careers_sort_order",
            "CREATE INDEX IF NOT EXISTS ix_employee_careers_sort_order ON employee_careers(sort_order)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_personal_info (개인정보, 직원당 1행) ——
    for label, sql in [
        (
            "employee_personal_info_table",
            """
CREATE TABLE IF NOT EXISTS employee_personal_info (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  nickname VARCHAR(100),
  place_of_birth VARCHAR(200),
  height_cm INTEGER,
  weight_kg INTEGER,
  race VARCHAR(100),
  nationality VARCHAR(100),
  religion VARCHAR(100),
  blood_group VARCHAR(20),
  personal_tel VARCHAR(50),
  personal_email VARCHAR(255),
  website VARCHAR(500),
  military_status VARCHAR(100),
  personal_notes TEXT,
  hobby VARCHAR(500),
  sports VARCHAR(500),
  typing_thai_wpm INTEGER,
  typing_english_wpm INTEGER,
  has_driving_license BOOLEAN NOT NULL DEFAULT FALSE,
  driving_license_number VARCHAR(100),
  own_car BOOLEAN NOT NULL DEFAULT FALSE,
  has_motorcycle_license BOOLEAN NOT NULL DEFAULT FALSE,
  motorcycle_license_number VARCHAR(100),
  own_motorcycle BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_employee_personal_info_employee_id UNIQUE (employee_id)
);
""",
        ),
        (
            "ix_employee_personal_info_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_personal_info_employee_id ON employee_personal_info(employee_id)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_foreigner_info (외국인 정보, 직원당 1행) ——
    for label, sql in [
        (
            "employee_foreigner_info_table",
            """
CREATE TABLE IF NOT EXISTS employee_foreigner_info (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  is_foreigner BOOLEAN NOT NULL DEFAULT FALSE,
  passport_number VARCHAR(100),
  passport_issue_place VARCHAR(200),
  passport_issue_date DATE,
  passport_expire_date DATE,
  passport_note TEXT,
  visa_number VARCHAR(100),
  visa_issue_place VARCHAR(200),
  visa_issue_date DATE,
  visa_expire_date DATE,
  visa_note TEXT,
  work_permit_number VARCHAR(100),
  work_permit_issue_place VARCHAR(200),
  work_permit_issue_date DATE,
  work_permit_expire_date DATE,
  work_permit_note TEXT,
  CONSTRAINT uq_employee_foreigner_info_employee_id UNIQUE (employee_id)
);
""",
        ),
        (
            "ix_employee_foreigner_info_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_foreigner_info_employee_id ON employee_foreigner_info(employee_id)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_addresses (주소정보 본적·현주소, 직원당 1행) ——
    for label, sql in [
        (
            "employee_addresses_table",
            """
CREATE TABLE IF NOT EXISTS employee_addresses (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  perm_house_no_th VARCHAR(100),
  perm_house_no_en VARCHAR(100),
  perm_building_th VARCHAR(200),
  perm_building_en VARCHAR(200),
  perm_soi_th VARCHAR(200),
  perm_soi_en VARCHAR(200),
  perm_street_th TEXT,
  perm_street_en TEXT,
  perm_nationality VARCHAR(200),
  perm_nationality_minor_code_id INTEGER,
  perm_zone VARCHAR(200),
  perm_zone_minor_code_id INTEGER,
  perm_province VARCHAR(200),
  perm_province_minor_code_id INTEGER,
  perm_district VARCHAR(200),
  perm_district_minor_code_id INTEGER,
  perm_sub_district VARCHAR(200),
  perm_sub_district_minor_code_id INTEGER,
  perm_postcode VARCHAR(30),
  perm_postcode_minor_code_id INTEGER,
  perm_telephone VARCHAR(50),
  curr_house_no_th VARCHAR(100),
  curr_house_no_en VARCHAR(100),
  curr_building_th VARCHAR(200),
  curr_building_en VARCHAR(200),
  curr_soi_th VARCHAR(200),
  curr_soi_en VARCHAR(200),
  curr_street_th TEXT,
  curr_street_en TEXT,
  curr_nationality VARCHAR(200),
  curr_nationality_minor_code_id INTEGER,
  curr_zone VARCHAR(200),
  curr_zone_minor_code_id INTEGER,
  curr_province VARCHAR(200),
  curr_province_minor_code_id INTEGER,
  curr_district VARCHAR(200),
  curr_district_minor_code_id INTEGER,
  curr_sub_district VARCHAR(200),
  curr_sub_district_minor_code_id INTEGER,
  curr_postcode VARCHAR(30),
  curr_postcode_minor_code_id INTEGER,
  curr_telephone VARCHAR(50),
  CONSTRAINT uq_employee_addresses_employee_id UNIQUE (employee_id)
);
""",
        ),
        (
            "ix_employee_addresses_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_employee_id ON employee_addresses(employee_id)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_addresses (minor_codes FK, 삭제 제한) ——
    for label, sql in [
        (
            "employee_addresses_add_minor_code_fk_cols",
            """
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
""",
        ),
        (
            "ix_employee_addresses_perm_nat_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_nationality_minor_code_id ON employee_addresses(perm_nationality_minor_code_id)",
        ),
        (
            "ix_employee_addresses_perm_zone_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_zone_minor_code_id ON employee_addresses(perm_zone_minor_code_id)",
        ),
        (
            "ix_employee_addresses_perm_prov_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_province_minor_code_id ON employee_addresses(perm_province_minor_code_id)",
        ),
        (
            "ix_employee_addresses_perm_dist_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_district_minor_code_id ON employee_addresses(perm_district_minor_code_id)",
        ),
        (
            "ix_employee_addresses_perm_subdist_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_sub_district_minor_code_id ON employee_addresses(perm_sub_district_minor_code_id)",
        ),
        (
            "ix_employee_addresses_perm_post_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_perm_postcode_minor_code_id ON employee_addresses(perm_postcode_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_nat_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_nationality_minor_code_id ON employee_addresses(curr_nationality_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_zone_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_zone_minor_code_id ON employee_addresses(curr_zone_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_prov_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_province_minor_code_id ON employee_addresses(curr_province_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_dist_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_district_minor_code_id ON employee_addresses(curr_district_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_subdist_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_sub_district_minor_code_id ON employee_addresses(curr_sub_district_minor_code_id)",
        ),
        (
            "ix_employee_addresses_curr_post_minor",
            "CREATE INDEX IF NOT EXISTS ix_employee_addresses_curr_postcode_minor_code_id ON employee_addresses(curr_postcode_minor_code_id)",
        ),
        (
            "employee_addresses_fk_perm_nationality",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_nationality_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_nationality_minor_code_id
      FOREIGN KEY (perm_nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_perm_zone",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_zone_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_zone_minor_code_id
      FOREIGN KEY (perm_zone_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_perm_province",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_province_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_province_minor_code_id
      FOREIGN KEY (perm_province_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_perm_district",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_district_minor_code_id
      FOREIGN KEY (perm_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_perm_sub_district",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_sub_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_sub_district_minor_code_id
      FOREIGN KEY (perm_sub_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_perm_postcode",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_perm_postcode_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_perm_postcode_minor_code_id
      FOREIGN KEY (perm_postcode_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_nationality",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_nationality_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_nationality_minor_code_id
      FOREIGN KEY (curr_nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_zone",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_zone_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_zone_minor_code_id
      FOREIGN KEY (curr_zone_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_province",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_province_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_province_minor_code_id
      FOREIGN KEY (curr_province_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_district",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_district_minor_code_id
      FOREIGN KEY (curr_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_sub_district",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_sub_district_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_sub_district_minor_code_id
      FOREIGN KEY (curr_sub_district_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_addresses_fk_curr_postcode",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_addresses_curr_postcode_minor_code_id') THEN
    ALTER TABLE employee_addresses
      ADD CONSTRAINT fk_employee_addresses_curr_postcode_minor_code_id
      FOREIGN KEY (curr_postcode_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_addresses 기존 데이터 minor_code_id 백필 (삭제 제한 동작 보장) ——
    # *_minor_code_id FK 컬럼이 NULL이면 minor_codes 삭제가 통과할 수 있으므로,
    # perm/curr의 minor_code 문자열을 기준으로 minor_codes(id)를 찾아 채웁니다.
    try:
        from app.database import SessionLocal
        from app.models.employee import Employee
        from app.models.employee_address import EmployeeAddress
        from app.models.major_code import MajorCode
        from app.models.minor_code import MinorCode

        session = SessionLocal()

        nationality_kw = ["국적", "Nationality", "สัญชาติ", "nationality"]
        zone_kw = ["zone", "Zone", "권역", "Zone 정보", "권역정보"]
        province_kw = ["도시정보", "도시", "Province 정보", "Province", "จังหวัด", "province"]
        district_kw = ["시/군/구 정보", "시/군/구", "시군구", "District 정보", "District", "district", "อำเภอ"]
        sub_district_kw = [
            "동/읍/면 정보",
            "동/읍/면",
            "동읍면",
            "Sub district 정보",
            "Sub district",
            "sub district",
            "ตำบล",
            "tumbon",
            "읍",
            "면",
        ]
        postcode_kw = [
            "우편번호",
            "우편 번호",
            "Postcode",
            "postcode",
            "우편번호 정보",
            "Zip",
            "zip",
            "Zip code",
            "รหัสไปรษณีย์",
        ]

        field_to_keywords = {
            "nationality": nationality_kw,
            "zone": zone_kw,
            "province": province_kw,
            "district": district_kw,
            "sub_district": sub_district_kw,
            "postcode": postcode_kw,
        }

        # 회사별 MajorCode(키워드 매칭)와 MinorCode(매칭 값→id)를 캐시합니다.
        major_ids_by_company: dict[int, dict[str, int | None]] = {}
        minor_id_map_by_company: dict[int, dict[tuple[int, str], int]] = {}

        companies = (
            session.query(Employee.company_id)
            .join(EmployeeAddress, EmployeeAddress.employee_id == Employee.id)
            .distinct()
            .all()
        )
        company_ids = [c[0] for c in companies if isinstance(c[0], int) or (c[0] is not None)]
        company_ids = [int(cid) for cid in company_ids if cid is not None]

        def find_major_id(company_id: int, keywords: list[str]) -> int | None:
            lowered = [k.lower() for k in keywords if k]
            majors = session.query(MajorCode).filter(MajorCode.company_id == company_id).all()
            for m in majors:
                pool = f"{m.major_code} {(m.name_kor or '')} {(m.name_eng or '')} {(m.name_thai or '')}".lower()
                if any(k in pool for k in lowered):
                    return m.id
            return None

        for cid in company_ids:
            majors_by_field: dict[str, int | None] = {}
            for field, kw in field_to_keywords.items():
                majors_by_field[field] = find_major_id(cid, kw)
            major_ids_by_company[cid] = majors_by_field

            resolved_major_ids = [mid for mid in majors_by_field.values() if mid is not None]
            if not resolved_major_ids:
                minor_id_map_by_company[cid] = {}
                continue

            minors = (
                session.query(MinorCode)
                .filter(MinorCode.company_id == cid, MinorCode.major_code_id.in_(resolved_major_ids))
                .all()
            )
            m: dict[tuple[int, str], int] = {}
            for mn in minors:
                key = (int(mn.major_code_id), str(mn.minor_code))
                m[key] = int(mn.id)
            minor_id_map_by_company[cid] = m

        addresses = session.query(EmployeeAddress).join(
            Employee, EmployeeAddress.employee_id == Employee.id
        ).all()

        updated = 0
        for addr in addresses:
            # join된 Employee를 직접 받을지 않으므로 company_id는 addr.employee_id로 다시 조회하지 않고,
            # addr.employee relationship을 쓰지 못하면 address에 company_id가 없어서 쿼리를 다시 해야합니다.
            # 하지만 ORM relationship이 lazy loading일 수 있어, 안전하게 company_id를 다시 조회합니다.
            emp = session.query(Employee).filter(Employee.id == addr.employee_id).first()
            if not emp or emp.company_id is None:
                continue
            cid = int(emp.company_id)

            for part in ("perm", "curr"):
                for field in field_to_keywords.keys():
                    code_val = getattr(addr, f"{part}_{field}", None)
                    major_id = major_ids_by_company.get(cid, {}).get(field)
                    if major_id is None or not code_val:
                        setattr(addr, f"{part}_{field}_minor_code_id", None)
                        continue
                    code_str = str(code_val).strip()
                    if not code_str:
                        setattr(addr, f"{part}_{field}_minor_code_id", None)
                        continue
                    minor_id = minor_id_map_by_company.get(cid, {}).get((int(major_id), code_str))
                    setattr(addr, f"{part}_{field}_minor_code_id", minor_id)
                    if minor_id is not None:
                        updated += 1

        if updated:
            session.commit()
        else:
            session.rollback()
        session.close()
    except Exception as e:
        # 백필 실패해도 서버 시작은 막지 않습니다. (단, minor 삭제 제한은 다음 저장 이후 반영될 수 있음)
        try:
            print(f"⚠️ employee_addresses minor_code_id 백필 실패(무시): {str(e)[:200]}")
        except Exception:
            pass

    # —— employee_certifications (자격증·면허) ——
    for label, sql in [
        (
            "employee_certifications_table",
            """
CREATE TABLE IF NOT EXISTS employee_certifications (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  license_type_minor_code_id INTEGER,
  issuer_minor_code_id INTEGER,
  license_code VARCHAR(50),
  license_type_name VARCHAR(300),
  grade VARCHAR(100),
  issuer_code VARCHAR(50),
  issuer_name VARCHAR(300),
  acquired_date DATE,
  effective_date DATE,
  next_renewal_date DATE,
  certificate_number VARCHAR(100)
);
""",
        ),
        (
            "ix_employee_certifications_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_certifications_employee_id ON employee_certifications(employee_id)",
        ),
        (
            "ix_employee_certifications_sort_order",
            "CREATE INDEX IF NOT EXISTS ix_employee_certifications_sort_order ON employee_certifications(sort_order)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_certifications (minor_codes FK, 삭제 제한) ——
    for label, sql in [
        (
            "employee_certifications_add_fk_col_license_type_minor_code_id",
            """
ALTER TABLE employee_certifications
  ADD COLUMN IF NOT EXISTS license_type_minor_code_id INTEGER;
""",
        ),
        (
            "employee_certifications_add_fk_col_issuer_minor_code_id",
            """
ALTER TABLE employee_certifications
  ADD COLUMN IF NOT EXISTS issuer_minor_code_id INTEGER;
""",
        ),
        (
            "ix_employee_certifications_license_type_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_certifications_license_type_minor_code_id ON employee_certifications(license_type_minor_code_id)",
        ),
        (
            "ix_employee_certifications_issuer_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_certifications_issuer_minor_code_id ON employee_certifications(issuer_minor_code_id)",
        ),
        (
            "employee_certifications_fk_license_type_minor_code_id",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_certifications_license_type_minor_code_id') THEN
    ALTER TABLE employee_certifications
      ADD CONSTRAINT fk_employee_certifications_license_type_minor_code_id
      FOREIGN KEY (license_type_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_certifications_fk_issuer_minor_code_id",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_certifications_issuer_minor_code_id') THEN
    ALTER TABLE employee_certifications
      ADD CONSTRAINT fk_employee_certifications_issuer_minor_code_id
      FOREIGN KEY (issuer_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_languages (어학정보) ——
    for label, sql in [
        (
            "employee_languages_table",
            """
CREATE TABLE IF NOT EXISTS employee_languages (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  acquisition_date DATE,
  language_code VARCHAR(50),
  test_type VARCHAR(50),
  score INTEGER,
  grade VARCHAR(50),
  expiry_date DATE
);
""",
        ),
        (
            "ix_employee_languages_employee_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_languages_employee_id ON employee_languages(employee_id)",
        ),
        (
            "ix_employee_languages_sort_order",
            "CREATE INDEX IF NOT EXISTS ix_employee_languages_sort_order ON employee_languages(sort_order)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— employee_educations FK (학위/전공/학교/국적 → minor_codes) ——
    for label, sql in [
        (
            "employee_educations_fk_cols",
            """
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS from_date DATE;
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS to_date DATE;
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS degree_minor_code_id INTEGER;
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS field_of_study_minor_code_id INTEGER;
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS institution_minor_code_id INTEGER;
ALTER TABLE employee_educations ADD COLUMN IF NOT EXISTS nationality_minor_code_id INTEGER;
""",
        ),
        (
            "ix_employee_educations_degree_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_educations_degree_minor_code_id ON employee_educations(degree_minor_code_id)",
        ),
        (
            "ix_employee_educations_field_of_study_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_educations_field_of_study_minor_code_id ON employee_educations(field_of_study_minor_code_id)",
        ),
        (
            "ix_employee_educations_institution_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_educations_institution_minor_code_id ON employee_educations(institution_minor_code_id)",
        ),
        (
            "ix_employee_educations_nationality_minor_code_id",
            "CREATE INDEX IF NOT EXISTS ix_employee_educations_nationality_minor_code_id ON employee_educations(nationality_minor_code_id)",
        ),
        (
            "employee_educations_fk_constraints",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_degree_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_degree_minor_code_id
      FOREIGN KEY (degree_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_field_of_study_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_field_of_study_minor_code_id
      FOREIGN KEY (field_of_study_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_institution_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_institution_minor_code_id
      FOREIGN KEY (institution_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_educations_nationality_minor_code_id') THEN
    ALTER TABLE employee_educations ADD CONSTRAINT fk_employee_educations_nationality_minor_code_id
      FOREIGN KEY (nationality_minor_code_id) REFERENCES minor_codes(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # —— 근태 기준정보 (회사별, FK → companies) ——
    for label, sql in [
        (
            "attendance_company_settings",
            """
CREATE TABLE IF NOT EXISTS attendance_company_settings (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  daily_work_hours VARCHAR(16) DEFAULT '08:00',
  monthly_work_hours VARCHAR(16) DEFAULT '08:00',
  day_base_days_per_month INTEGER DEFAULT 30,
  ot_rate_level_1 NUMERIC(10,4) DEFAULT 1,
  ot_rate_level_2 NUMERIC(10,4) DEFAULT 1.5,
  ot_rate_level_3 NUMERIC(10,4) DEFAULT 2,
  ot_rate_level_4 NUMERIC(10,4) DEFAULT 2.5,
  ot_rate_level_5 NUMERIC(10,4) DEFAULT 3,
  processing_format VARCHAR(100) DEFAULT 'normal',
  backward_cross_company BOOLEAN NOT NULL DEFAULT FALSE,
  hide_time_status_no_check BOOLEAN NOT NULL DEFAULT FALSE,
  zip_card_policy VARCHAR(40) DEFAULT 'warning_full_day',
  zip_status_in VARCHAR(200),
  zip_no_machine VARCHAR(200),
  opt_remark_time_off BOOLEAN NOT NULL DEFAULT FALSE,
  opt_message_time_off_charge BOOLEAN NOT NULL DEFAULT FALSE,
  opt_message_leave BOOLEAN NOT NULL DEFAULT FALSE,
  opt_late_check_half_day_leave BOOLEAN NOT NULL DEFAULT FALSE,
  opt_process_record_leaves BOOLEAN NOT NULL DEFAULT FALSE,
  opt_count_leave_in_schedule BOOLEAN NOT NULL DEFAULT FALSE,
  opt_half_day_leave_half_base BOOLEAN NOT NULL DEFAULT FALSE
);
""",
        ),
        (
            "ix_attendance_company_settings_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_company_settings_company ON attendance_company_settings(company_id)",
        ),
        (
            "attendance_special_allowance",
            """
CREATE TABLE IF NOT EXISTS attendance_special_allowance (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  slot_index SMALLINT NOT NULL,
  name VARCHAR(300),
  working_ot_on_holiday BOOLEAN NOT NULL DEFAULT FALSE,
  payment_full_day BOOLEAN NOT NULL DEFAULT TRUE,
  no_payment_late_early BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_attendance_special_allowance_co_slot UNIQUE (company_id, slot_index),
  CONSTRAINT ck_attendance_special_slot CHECK (slot_index >= 1 AND slot_index <= 3)
);
""",
        ),
        (
            "ix_attendance_special_allowance_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_special_allowance_company ON attendance_special_allowance(company_id)",
        ),
        (
            "attendance_shift_group_master",
            """
CREATE TABLE IF NOT EXISTS attendance_shift_group_master (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  CONSTRAINT uq_att_shift_group_master_co_name UNIQUE (company_id, name)
);
""",
        ),
        (
            "ix_attendance_shift_group_master_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_shift_group_master_company ON attendance_shift_group_master(company_id)",
        ),
        (
            "attendance_shift_group_master_description",
            "ALTER TABLE attendance_shift_group_master ADD COLUMN IF NOT EXISTS description TEXT",
        ),
        (
            "attendance_shift",
            """
CREATE TABLE IF NOT EXISTS attendance_shift (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_code VARCHAR(50) NOT NULL,
  title VARCHAR(500),
  start_check_in VARCHAR(16),
  start_work VARCHAR(16),
  lateness_count_start VARCHAR(16),
  break_late_time VARCHAR(16),
  break_late_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  break_early_time VARCHAR(16),
  break_early_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  break_sum VARCHAR(16),
  time_out VARCHAR(16),
  continue_shift_without_zip_minutes INTEGER DEFAULT 0,
  work_on_holiday BOOLEAN NOT NULL DEFAULT FALSE,
  late_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  late_threshold_minutes INTEGER DEFAULT 0,
  late_shift_note VARCHAR(100),
  late_monthly_note VARCHAR(100),
  early_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  leaves_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  leave_food_minutes INTEGER DEFAULT 0,
  leave_food_monthly INTEGER DEFAULT 0,
  leave_food_daily INTEGER DEFAULT 0,
  continuous_ot_minutes INTEGER DEFAULT 0,
  continuous_ot_after BOOLEAN NOT NULL DEFAULT FALSE,
  continuous_ot_before BOOLEAN NOT NULL DEFAULT FALSE,
  allowance_food INTEGER DEFAULT 0,
  allowance_food_monthly INTEGER DEFAULT 0,
  allowance_food_daily INTEGER DEFAULT 0,
  allowance_shift INTEGER DEFAULT 0,
  work_holiday_threshold_minutes INTEGER DEFAULT 0,
  work_holiday_daily INTEGER DEFAULT 0,
  work_holiday_monthly INTEGER DEFAULT 0,
  late_daily INTEGER DEFAULT 0,
  late_monthly INTEGER DEFAULT 0,
  early_threshold_minutes INTEGER DEFAULT 0,
  early_daily INTEGER DEFAULT 0,
  early_monthly INTEGER DEFAULT 0,
  leaves_threshold_minutes INTEGER DEFAULT 0,
  leaves_daily INTEGER DEFAULT 0,
  leaves_monthly INTEGER DEFAULT 0,
  food_daily INTEGER DEFAULT 0,
  food_monthly INTEGER DEFAULT 0,
  CONSTRAINT uq_attendance_shift_co_code UNIQUE (company_id, shift_code)
);
""",
        ),
        (
            "ix_attendance_shift_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_shift_company ON attendance_shift(company_id)",
        ),
        (
            "attendance_shift_leave_food_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS leave_food_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_leave_food_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS leave_food_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_allowance_food_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS allowance_food_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_allowance_food_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS allowance_food_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_work_holiday_threshold_minutes",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS work_holiday_threshold_minutes INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_work_holiday_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS work_holiday_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_work_holiday_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS work_holiday_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_late_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS late_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_late_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS late_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_early_threshold_minutes",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS early_threshold_minutes INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_early_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS early_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_early_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS early_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_leaves_threshold_minutes",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS leaves_threshold_minutes INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_leaves_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS leaves_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_leaves_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS leaves_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_food_daily",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS food_daily INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_food_monthly",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS food_monthly INTEGER DEFAULT 0",
        ),
        (
            "attendance_shift_allowance_late_shift_json",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS shift_allowance_late_shift_json JSONB",
        ),
        (
            "attendance_shift_allowance_early_food_json",
            "ALTER TABLE attendance_shift ADD COLUMN IF NOT EXISTS shift_allowance_early_food_json JSONB",
        ),
        (
            "attendance_shift_ot_range",
            """
CREATE TABLE IF NOT EXISTS attendance_shift_ot_range (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  shift_id INTEGER NOT NULL REFERENCES attendance_shift(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  range_start VARCHAR(16),
  range_end VARCHAR(16),
  monthly_rate_a NUMERIC(12,4),
  monthly_rate_b NUMERIC(12,4),
  monthly_rate_holiday NUMERIC(12,4),
  daily_rate_a NUMERIC(12,4),
  daily_rate_b NUMERIC(12,4),
  daily_rate_holiday NUMERIC(12,4),
  CONSTRAINT uq_attendance_shift_ot_range UNIQUE (shift_id, sort_order)
);
""",
        ),
        (
            "ix_attendance_shift_ot_range_shift",
            "CREATE INDEX IF NOT EXISTS ix_attendance_shift_ot_range_shift ON attendance_shift_ot_range(shift_id)",
        ),
        (
            "attendance_shift_ot_range_monthly_holiday",
            "ALTER TABLE attendance_shift_ot_range ADD COLUMN IF NOT EXISTS monthly_rate_holiday NUMERIC(12,4)",
        ),
        (
            "attendance_shift_ot_range_daily_holiday",
            "ALTER TABLE attendance_shift_ot_range ADD COLUMN IF NOT EXISTS daily_rate_holiday NUMERIC(12,4)",
        ),
        (
            "attendance_round_up_section",
            """
CREATE TABLE IF NOT EXISTS attendance_round_up_section (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tab_key VARCHAR(32) NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  mode_code VARCHAR(64),
  flag_payroll_include BOOLEAN NOT NULL DEFAULT FALSE,
  flag_first_minute BOOLEAN NOT NULL DEFAULT FALSE,
  flag_footer BOOLEAN NOT NULL DEFAULT FALSE,
  flag_use_late_count BOOLEAN NOT NULL DEFAULT FALSE,
  extra_json JSONB,
  CONSTRAINT uq_attendance_round_up_section UNIQUE (company_id, tab_key, section_key)
);
""",
        ),
        (
            "ix_attendance_round_up_section_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_round_up_section_company ON attendance_round_up_section(company_id)",
        ),
        (
            "attendance_round_up_tier",
            """
CREATE TABLE IF NOT EXISTS attendance_round_up_tier (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  section_id INTEGER NOT NULL REFERENCES attendance_round_up_section(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  value_from INTEGER NOT NULL DEFAULT 0,
  value_to INTEGER NOT NULL DEFAULT 0,
  rounded_minutes INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_attendance_round_up_tier UNIQUE (section_id, row_index)
);
""",
        ),
        (
            "ix_attendance_round_up_tier_section",
            "CREATE INDEX IF NOT EXISTS ix_attendance_round_up_tier_section ON attendance_round_up_tier(section_id)",
        ),
        (
            "attendance_leave_level",
            """
CREATE TABLE IF NOT EXISTS attendance_leave_level (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL,
  CONSTRAINT uq_attendance_leave_level_co_lv UNIQUE (company_id, level_number),
  CONSTRAINT ck_attendance_leave_level_num CHECK (level_number >= 1 AND level_number <= 6)
);
""",
        ),
        (
            "ix_attendance_leave_level_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_leave_level_company ON attendance_leave_level(company_id)",
        ),
        (
            "attendance_leave_level_row",
            """
CREATE TABLE IF NOT EXISTS attendance_leave_level_row (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  leave_level_id INTEGER NOT NULL REFERENCES attendance_leave_level(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  leave_type_name VARCHAR(200) NOT NULL DEFAULT '',
  days_quota NUMERIC(12,2) DEFAULT 0,
  hours_quota INTEGER DEFAULT 0,
  minutes_quota INTEGER DEFAULT 0,
  option_checked BOOLEAN NOT NULL DEFAULT FALSE
);
""",
        ),
        (
            "ix_attendance_leave_level_row_level",
            "CREATE INDEX IF NOT EXISTS ix_attendance_leave_level_row_level ON attendance_leave_level_row(leave_level_id)",
        ),
        (
            "attendance_leave_global",
            """
CREATE TABLE IF NOT EXISTS attendance_leave_global (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  statutory_start_date DATE,
  leave_other_start_date DATE,
  cumulative_year INTEGER,
  summer_employee_plus_one BOOLEAN NOT NULL DEFAULT FALSE,
  display_start_date DATE,
  thai_notice_text TEXT,
  certificate_web_path VARCHAR(500)
);
""",
        ),
        (
            "attendance_company_holiday",
            """
CREATE TABLE IF NOT EXISTS attendance_company_holiday (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  remarks TEXT,
  CONSTRAINT uq_attendance_company_holiday UNIQUE (company_id, holiday_date)
);
""",
        ),
        (
            "ix_attendance_company_holiday_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_company_holiday_company ON attendance_company_holiday(company_id)",
        ),
        (
            "attendance_payment_period",
            """
CREATE TABLE IF NOT EXISTS attendance_payment_period (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_year INTEGER NOT NULL,
  calendar_month INTEGER NOT NULL,
  period_label VARCHAR(100) NOT NULL DEFAULT 'Period 1',
  start_date_daily DATE,
  end_date_daily DATE,
  start_date_monthly DATE,
  end_date_monthly DATE,
  ot_start_daily DATE,
  ot_end_daily DATE,
  ot_start_monthly DATE,
  ot_end_monthly DATE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at DATE,
  closed_by_user_id INTEGER,
  remarks TEXT,
  CONSTRAINT uq_attendance_payment_period UNIQUE (company_id, calendar_year, calendar_month, period_label),
  CONSTRAINT ck_attendance_payment_month CHECK (calendar_month >= 1 AND calendar_month <= 12)
);
""",
        ),
        (
            "ix_attendance_payment_period_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_payment_period_company ON attendance_payment_period(company_id)",
        ),
        (
            "attendance_payment_period_is_closed_col",
            "ALTER TABLE attendance_payment_period ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        (
            "attendance_payment_period_closed_at_col",
            "ALTER TABLE attendance_payment_period ADD COLUMN IF NOT EXISTS closed_at DATE",
        ),
        (
            "attendance_payment_period_closed_by_user_id_col",
            "ALTER TABLE attendance_payment_period ADD COLUMN IF NOT EXISTS closed_by_user_id INTEGER",
        ),
        (
            "attendance_work_calendar",
            """
CREATE TABLE IF NOT EXISTS attendance_work_calendar (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_year INTEGER NOT NULL,
  calendar_month INTEGER NOT NULL,
  shift_id INTEGER NOT NULL REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  shift_code VARCHAR(50),
  CONSTRAINT uq_att_work_calendar UNIQUE (company_id, calendar_year, calendar_month, shift_id),
  CONSTRAINT ck_att_work_calendar_month CHECK (calendar_month >= 1 AND calendar_month <= 12)
);
""",
        ),
        (
            "ix_attendance_work_calendar_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_work_calendar_company ON attendance_work_calendar(company_id)",
        ),
        (
            "attendance_work_calendar_shift_id_col",
            "ALTER TABLE attendance_work_calendar ADD COLUMN IF NOT EXISTS shift_id INTEGER",
        ),
        (
            "attendance_work_calendar_shift_code_col",
            "ALTER TABLE attendance_work_calendar ADD COLUMN IF NOT EXISTS shift_code VARCHAR(50)",
        ),
        (
            "attendance_work_calendar_shift_group_name_col",
            "ALTER TABLE attendance_work_calendar ADD COLUMN IF NOT EXISTS shift_group_name VARCHAR(200)",
        ),
        (
            "attendance_work_calendar_backfill_shift_id_from_shift_code",
            """
UPDATE attendance_work_calendar c
SET shift_id = s.id
FROM attendance_shift s
WHERE c.shift_id IS NULL
  AND c.company_id = s.company_id
  AND TRIM(COALESCE(c.shift_code, '')) = TRIM(COALESCE(s.shift_code, ''))
""",
        ),
        (
            "attendance_work_calendar_backfill_shift_id_from_group_name",
            """
UPDATE attendance_work_calendar c
SET shift_id = s.id
FROM attendance_shift s
WHERE c.shift_id IS NULL
  AND c.company_id = s.company_id
  AND (
    TRIM(COALESCE(c.shift_group_name, '')) = TRIM(COALESCE(s.shift_code, ''))
    OR TRIM(COALESCE(c.shift_group_name, '')) = TRIM(COALESCE(s.title, ''))
  )
""",
        ),
        (
            "attendance_work_calendar_shift_fk",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_shift_id') THEN
    ALTER TABLE attendance_work_calendar
      ADD CONSTRAINT fk_att_work_calendar_shift_id
      FOREIGN KEY (shift_id)
      REFERENCES attendance_shift(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "ix_attendance_work_calendar_shift_id",
            "CREATE INDEX IF NOT EXISTS ix_attendance_work_calendar_shift_id ON attendance_work_calendar(shift_id)",
        ),
        (
            "uq_att_work_calendar_by_shift_id",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_att_work_calendar_by_shift_id ON attendance_work_calendar(company_id, calendar_year, calendar_month, shift_id)",
        ),
        (
            "attendance_work_calendar_shift_id_not_null",
            "ALTER TABLE attendance_work_calendar ALTER COLUMN shift_id SET NOT NULL",
        ),
        (
            "attendance_work_calendar_shift_group_id_col",
            "ALTER TABLE attendance_work_calendar ADD COLUMN IF NOT EXISTS shift_group_id INTEGER",
        ),
        (
            "attendance_work_calendar_backfill_shift_group_from_name",
            """
UPDATE attendance_work_calendar c
SET shift_group_id = g.id
FROM attendance_shift_group_master g
WHERE c.shift_group_id IS NULL
  AND c.company_id = g.company_id
  AND TRIM(COALESCE(c.shift_group_name, '')) <> ''
  AND TRIM(COALESCE(c.shift_group_name, '')) = TRIM(COALESCE(g.name, ''))
""",
        ),
        (
            "attendance_work_calendar_backfill_shift_group_first",
            """
UPDATE attendance_work_calendar c
SET shift_group_id = sub.gid
FROM (
  SELECT DISTINCT ON (company_id) company_id, id AS gid
  FROM attendance_shift_group_master
  ORDER BY company_id, sort_order ASC, id ASC
) sub
WHERE c.shift_group_id IS NULL
  AND c.company_id = sub.company_id
""",
        ),
        (
            "attendance_work_calendar_drop_old_uq",
            "ALTER TABLE attendance_work_calendar DROP CONSTRAINT IF EXISTS uq_att_work_calendar",
        ),
        (
            "attendance_work_calendar_drop_uq_shift_id_index",
            "DROP INDEX IF EXISTS uq_att_work_calendar_by_shift_id",
        ),
        (
            "attendance_work_calendar_shift_id_nullable",
            "ALTER TABLE attendance_work_calendar ALTER COLUMN shift_id DROP NOT NULL",
        ),
        (
            "attendance_work_calendar_delete_no_group",
            "DELETE FROM attendance_work_calendar WHERE shift_group_id IS NULL",
        ),
        (
            "attendance_work_calendar_shift_group_not_null",
            "ALTER TABLE attendance_work_calendar ALTER COLUMN shift_group_id SET NOT NULL",
        ),
        (
            "attendance_work_calendar_fk_shift_group",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_shift_group_id') THEN
    ALTER TABLE attendance_work_calendar
      ADD CONSTRAINT fk_att_work_calendar_shift_group_id
      FOREIGN KEY (shift_group_id)
      REFERENCES attendance_shift_group_master(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "attendance_work_calendar_dedupe_by_group",
            """
DELETE FROM attendance_work_calendar a
USING attendance_work_calendar b
WHERE a.company_id = b.company_id
  AND a.calendar_year = b.calendar_year
  AND a.calendar_month = b.calendar_month
  AND a.shift_group_id = b.shift_group_id
  AND a.id > b.id
""",
        ),
        (
            "uq_att_work_calendar_by_shift_group",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_att_work_calendar_by_shift_group ON attendance_work_calendar(company_id, calendar_year, calendar_month, shift_group_id)",
        ),
        (
            "attendance_work_calendar_repair_shift_group_id_orphans",
            """
UPDATE attendance_work_calendar c
SET shift_group_id = g.id
FROM attendance_shift_group_master g
WHERE c.company_id = g.company_id
  AND TRIM(COALESCE(c.shift_group_name, '')) <> ''
  AND TRIM(COALESCE(g.name, '')) = TRIM(COALESCE(c.shift_group_name, ''))
  AND NOT EXISTS (SELECT 1 FROM attendance_shift_group_master m WHERE m.id = c.shift_group_id);

UPDATE attendance_work_calendar c
SET shift_group_id = sub.gid
FROM (
  SELECT DISTINCT ON (company_id) company_id, id AS gid
  FROM attendance_shift_group_master
  ORDER BY company_id, sort_order ASC, id ASC
) sub
WHERE c.company_id = sub.company_id
  AND NOT EXISTS (SELECT 1 FROM attendance_shift_group_master m WHERE m.id = c.shift_group_id);

DELETE FROM attendance_work_calendar c
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_shift_group_master m WHERE m.id = c.shift_group_id
);
""",
        ),
        (
            "attendance_work_calendar_ensure_fk_shift_group_restrict",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_shift_group_id') THEN
    ALTER TABLE attendance_work_calendar
      ADD CONSTRAINT fk_att_work_calendar_shift_group_id
      FOREIGN KEY (shift_group_id)
      REFERENCES attendance_shift_group_master(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "attendance_work_calendar_day",
            """
CREATE TABLE IF NOT EXISTS attendance_work_calendar_day (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  calendar_id INTEGER NOT NULL REFERENCES attendance_work_calendar(id) ON DELETE CASCADE,
  day_of_month INTEGER NOT NULL,
  shift_code VARCHAR(50),
  is_workday BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_att_work_calendar_day UNIQUE (calendar_id, day_of_month),
  CONSTRAINT ck_att_work_calendar_day CHECK (day_of_month >= 1 AND day_of_month <= 31)
);
""",
        ),
        (
            "ix_attendance_work_calendar_day_calendar",
            "CREATE INDEX IF NOT EXISTS ix_attendance_work_calendar_day_calendar ON attendance_work_calendar_day(calendar_id)",
        ),
        (
            "attendance_work_calendar_day_shift_id_col",
            "ALTER TABLE attendance_work_calendar_day ADD COLUMN IF NOT EXISTS shift_id INTEGER",
        ),
        (
            "attendance_work_calendar_day_backfill_shift_id",
            """
UPDATE attendance_work_calendar_day d
SET shift_id = s.id
FROM attendance_work_calendar cal
JOIN attendance_shift s ON s.company_id = cal.company_id
  AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(d.shift_code, ''))
WHERE d.calendar_id = cal.id
  AND d.shift_id IS NULL
  AND TRIM(COALESCE(d.shift_code, '')) <> ''
""",
        ),
        (
            "attendance_work_calendar_day_fk_shift",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_day_shift_id') THEN
    ALTER TABLE attendance_work_calendar_day
      ADD CONSTRAINT fk_att_work_calendar_day_shift_id
      FOREIGN KEY (shift_id)
      REFERENCES attendance_shift(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "ix_attendance_work_calendar_day_shift_id",
            "CREATE INDEX IF NOT EXISTS ix_attendance_work_calendar_day_shift_id ON attendance_work_calendar_day(shift_id)",
        ),
        (
            "attendance_work_calendar_day_company_id_col",
            "ALTER TABLE attendance_work_calendar_day ADD COLUMN IF NOT EXISTS company_id INTEGER",
        ),
        (
            "attendance_work_calendar_day_backfill_company_id",
            """
UPDATE attendance_work_calendar_day d
SET company_id = cal.company_id
FROM attendance_work_calendar cal
WHERE d.calendar_id = cal.id
  AND (d.company_id IS NULL OR d.company_id IS DISTINCT FROM cal.company_id)
""",
        ),
        (
            "attendance_work_calendar_day_shift_code_empty_to_null",
            """
UPDATE attendance_work_calendar_day
SET shift_code = NULL
WHERE shift_code IS NOT NULL AND TRIM(COALESCE(shift_code, '')) = ''
""",
        ),
        (
            "attendance_work_calendar_day_clear_orphan_shift_code",
            """
UPDATE attendance_work_calendar_day d
SET shift_code = NULL, shift_id = NULL
FROM attendance_work_calendar cal
WHERE d.calendar_id = cal.id
  AND d.shift_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance_shift s
    WHERE s.company_id = cal.company_id
      AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(d.shift_code, ''))
  )
""",
        ),
        (
            "attendance_work_calendar_day_company_id_not_null",
            "ALTER TABLE attendance_work_calendar_day ALTER COLUMN company_id SET NOT NULL",
        ),
        (
            "attendance_work_calendar_day_fk_company_id",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_day_company_id') THEN
    ALTER TABLE attendance_work_calendar_day
      ADD CONSTRAINT fk_att_work_calendar_day_company_id
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
""",
        ),
        (
            "attendance_work_calendar_day_fk_co_shift_code",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_att_work_calendar_day_co_shift_code') THEN
    ALTER TABLE attendance_work_calendar_day
      ADD CONSTRAINT fk_att_work_calendar_day_co_shift_code
      FOREIGN KEY (company_id, shift_code)
      REFERENCES attendance_shift(company_id, shift_code)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "ix_attendance_work_calendar_day_company_shift",
            "CREATE INDEX IF NOT EXISTS ix_att_work_calendar_day_co_shift ON attendance_work_calendar_day(company_id, shift_code)",
        ),
    ]:
        _run_ddl(engine, sql, label)

    # 직원 근태 마스터 (탭별 테이블)
    for _lbl, _sql in [
        (
            "employee_attendance_master",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_master (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  contract_start_date DATE,
  contract_end_date DATE,
  card_code_extra VARCHAR(80)
);
""",
        ),
        (
            "ix_employee_attendance_master_company",
            "CREATE INDEX IF NOT EXISTS ix_employee_attendance_master_company ON employee_attendance_master(company_id)",
        ),
        (
            "employee_attendance_master_basic",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_master_basic (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  master_id INTEGER NOT NULL UNIQUE REFERENCES employee_attendance_master(id) ON DELETE CASCADE,
  employment_starting_date DATE,
  end_probation_date DATE,
  probation_days INTEGER,
  days_experience_text VARCHAR(50),
  annual_holiday_form VARCHAR(200),
  master_shiftwork_id INTEGER REFERENCES attendance_shift_group_master(id) ON DELETE RESTRICT,
  master_shiftwork VARCHAR(200),
  check_in_zip_card BOOLEAN NOT NULL DEFAULT FALSE,
  check_out_zip_card BOOLEAN NOT NULL DEFAULT FALSE,
  received_food_allow BOOLEAN NOT NULL DEFAULT FALSE,
  not_charge_early BOOLEAN NOT NULL DEFAULT FALSE,
  not_rounding_early BOOLEAN NOT NULL DEFAULT FALSE,
  received_shift_payment BOOLEAN NOT NULL DEFAULT FALSE,
  not_charge_lateness BOOLEAN NOT NULL DEFAULT FALSE,
  not_rounding_lateness BOOLEAN NOT NULL DEFAULT FALSE,
  day_and_ot_zero BOOLEAN NOT NULL DEFAULT FALSE,
  deduct_baht_per_minute NUMERIC(12,4),
  deduct_early_checkout_baht NUMERIC(12,4),
  charge_type VARCHAR(100)
);
""",
        ),
        (
            "employee_attendance_master_ot",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_master_ot (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  master_id INTEGER NOT NULL UNIQUE REFERENCES employee_attendance_master(id) ON DELETE CASCADE,
  not_cut_ot BOOLEAN NOT NULL DEFAULT FALSE,
  not_charge_ot_send_payroll BOOLEAN NOT NULL DEFAULT FALSE,
  ot_pay_each_hour_ot6 BOOLEAN NOT NULL DEFAULT FALSE,
  chang_all_ot6 BOOLEAN NOT NULL DEFAULT FALSE,
  auto_ot_on_holiday BOOLEAN NOT NULL DEFAULT FALSE,
  auto_ot_exclude_holidays BOOLEAN NOT NULL DEFAULT FALSE,
  ot6_hourly_baht NUMERIC(12,4),
  ui_lunchtime_by_emp_baht NUMERIC(12,4)
);
""",
        ),
        (
            "employee_attendance_special_charge",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_special_charge (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  master_id INTEGER NOT NULL REFERENCES employee_attendance_master(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  label VARCHAR(200) NOT NULL DEFAULT '',
  amount_baht NUMERIC(12,4) NOT NULL DEFAULT 0,
  CONSTRAINT uq_easc_master_slot UNIQUE (master_id, slot_index),
  CONSTRAINT ck_easc_slot CHECK (slot_index >= 1 AND slot_index <= 10)
);
""",
        ),
        (
            "ix_easc_master",
            "CREATE INDEX IF NOT EXISTS ix_easc_master ON employee_attendance_special_charge(master_id)",
        ),
        (
            "employee_attendance_shift_setting",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_shift_setting (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  master_id INTEGER NOT NULL UNIQUE REFERENCES employee_attendance_master(id) ON DELETE CASCADE,
  schedule_mode VARCHAR(20) NOT NULL DEFAULT 'week',
  sun_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sun_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  sun_shift_value VARCHAR(100),
  mon_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mon_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  mon_shift_value VARCHAR(100),
  tue_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tue_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  tue_shift_value VARCHAR(100),
  wed_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  wed_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  wed_shift_value VARCHAR(100),
  thu_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  thu_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  thu_shift_value VARCHAR(100),
  fri_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  fri_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  fri_shift_value VARCHAR(100),
  sat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sat_shift_id INTEGER REFERENCES attendance_shift(id) ON DELETE RESTRICT,
  sat_shift_value VARCHAR(100)
);
""",
        ),
        (
            "employee_attendance_leave_balance",
            """
CREATE TABLE IF NOT EXISTS employee_attendance_leave_balance (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  master_id INTEGER NOT NULL UNIQUE REFERENCES employee_attendance_master(id) ON DELETE CASCADE,
  leave_year INTEGER NOT NULL DEFAULT 2026,
  prev_days INTEGER,
  prev_hours INTEGER,
  prev_minutes INTEGER,
  transferred_days INTEGER,
  transferred_hours INTEGER,
  transferred_minutes INTEGER,
  used_days INTEGER,
  used_hours INTEGER,
  used_minutes INTEGER,
  year_days INTEGER,
  year_hours INTEGER,
  year_minutes INTEGER,
  level_of_leave VARCHAR(50),
  compensate_accumulated VARCHAR(10)
);
""",
        ),
        (
            "employee_annual_leave_balance",
            """
CREATE TABLE IF NOT EXISTS employee_annual_leave_balance (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  leave_year INTEGER NOT NULL,
  base_date DATE,
  service_days INTEGER,
  generated_days INTEGER,
  prev_days INTEGER,
  prev_hours INTEGER,
  prev_minutes INTEGER,
  transferred_days INTEGER,
  transferred_hours INTEGER,
  transferred_minutes INTEGER,
  used_days INTEGER,
  used_hours INTEGER,
  used_minutes INTEGER,
  year_days INTEGER,
  year_hours INTEGER,
  year_minutes INTEGER,
  level_of_leave VARCHAR(50),
  compensate_accumulated VARCHAR(10),
  CONSTRAINT uq_employee_annual_leave_employee_year UNIQUE (employee_id, leave_year)
);
""",
        ),
        (
            "ix_employee_annual_leave_company",
            "CREATE INDEX IF NOT EXISTS ix_employee_annual_leave_company ON employee_annual_leave_balance(company_id)",
        ),
        (
            "ix_employee_annual_leave_year",
            "CREATE INDEX IF NOT EXISTS ix_employee_annual_leave_year ON employee_annual_leave_balance(leave_year)",
        ),
    ]:
        _run_ddl(engine, _sql, _lbl)

    for _lbl, _sql in [
        (
            "employee_attendance_master_basic_master_shiftwork_id_col",
            "ALTER TABLE employee_attendance_master_basic ADD COLUMN IF NOT EXISTS master_shiftwork_id INTEGER",
        ),
        (
            "employee_attendance_master_basic_master_shiftwork_id_fk",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_emp_att_master_basic_shift_group_id') THEN
    ALTER TABLE employee_attendance_master_basic
      ADD CONSTRAINT fk_emp_att_master_basic_shift_group_id
      FOREIGN KEY (master_shiftwork_id)
      REFERENCES attendance_shift_group_master(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "employee_attendance_master_basic_master_shiftwork_id_idx",
            "CREATE INDEX IF NOT EXISTS ix_emp_att_master_basic_shift_group_id ON employee_attendance_master_basic(master_shiftwork_id)",
        ),
        (
            "employee_attendance_master_basic_deduct_baht_per_minute_col",
            "ALTER TABLE employee_attendance_master_basic ADD COLUMN IF NOT EXISTS deduct_baht_per_minute NUMERIC(12,4)",
        ),
        (
            "employee_attendance_master_basic_deduct_early_checkout_baht_col",
            "ALTER TABLE employee_attendance_master_basic ADD COLUMN IF NOT EXISTS deduct_early_checkout_baht NUMERIC(12,4)",
        ),
        (
            "employee_attendance_master_ot_auto_ot_exclude_holidays",
            "ALTER TABLE employee_attendance_master_ot ADD COLUMN IF NOT EXISTS auto_ot_exclude_holidays BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        (
            "employee_attendance_master_basic_backfill_shift_group_id_from_name",
            """
UPDATE employee_attendance_master_basic b
SET master_shiftwork_id = g.id
FROM employee_attendance_master m
JOIN attendance_shift_group_master g
  ON g.company_id = m.company_id
WHERE b.master_id = m.id
  AND b.master_shiftwork_id IS NULL
  AND TRIM(COALESCE(b.master_shiftwork, '')) <> ''
  AND LOWER(TRIM(g.name)) = LOWER(TRIM(b.master_shiftwork));
""",
        ),
        (
            "emp_att_shift_setting_shift_id_cols",
            """
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS sun_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS mon_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS tue_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS wed_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS thu_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS fri_shift_id INTEGER;
ALTER TABLE employee_attendance_shift_setting ADD COLUMN IF NOT EXISTS sat_shift_id INTEGER;
""",
        ),
        (
            "emp_att_shift_setting_shift_id_backfill_from_code",
            """
UPDATE employee_attendance_shift_setting ss
SET
  sun_shift_id = COALESCE(
    ss.sun_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.sun_shift_value, '')) LIMIT 1)
  ),
  mon_shift_id = COALESCE(
    ss.mon_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.mon_shift_value, '')) LIMIT 1)
  ),
  tue_shift_id = COALESCE(
    ss.tue_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.tue_shift_value, '')) LIMIT 1)
  ),
  wed_shift_id = COALESCE(
    ss.wed_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.wed_shift_value, '')) LIMIT 1)
  ),
  thu_shift_id = COALESCE(
    ss.thu_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.thu_shift_value, '')) LIMIT 1)
  ),
  fri_shift_id = COALESCE(
    ss.fri_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.fri_shift_value, '')) LIMIT 1)
  ),
  sat_shift_id = COALESCE(
    ss.sat_shift_id,
    (SELECT s.id FROM attendance_shift s WHERE s.company_id = m.company_id AND TRIM(COALESCE(s.shift_code, '')) = TRIM(COALESCE(ss.sat_shift_value, '')) LIMIT 1)
  )
FROM employee_attendance_master m
WHERE ss.master_id = m.id;
""",
        ),
        (
            "emp_att_shift_setting_shift_id_backfill_from_numeric_value",
            """
UPDATE employee_attendance_shift_setting ss
SET
  sun_shift_id = CASE WHEN ss.sun_shift_id IS NULL AND TRIM(COALESCE(ss.sun_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.sun_shift_value) AS INTEGER) ELSE ss.sun_shift_id END,
  mon_shift_id = CASE WHEN ss.mon_shift_id IS NULL AND TRIM(COALESCE(ss.mon_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.mon_shift_value) AS INTEGER) ELSE ss.mon_shift_id END,
  tue_shift_id = CASE WHEN ss.tue_shift_id IS NULL AND TRIM(COALESCE(ss.tue_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.tue_shift_value) AS INTEGER) ELSE ss.tue_shift_id END,
  wed_shift_id = CASE WHEN ss.wed_shift_id IS NULL AND TRIM(COALESCE(ss.wed_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.wed_shift_value) AS INTEGER) ELSE ss.wed_shift_id END,
  thu_shift_id = CASE WHEN ss.thu_shift_id IS NULL AND TRIM(COALESCE(ss.thu_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.thu_shift_value) AS INTEGER) ELSE ss.thu_shift_id END,
  fri_shift_id = CASE WHEN ss.fri_shift_id IS NULL AND TRIM(COALESCE(ss.fri_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.fri_shift_value) AS INTEGER) ELSE ss.fri_shift_id END,
  sat_shift_id = CASE WHEN ss.sat_shift_id IS NULL AND TRIM(COALESCE(ss.sat_shift_value,'')) ~ '^[0-9]+$' THEN CAST(TRIM(ss.sat_shift_value) AS INTEGER) ELSE ss.sat_shift_id END;
""",
        ),
        (
            "emp_att_shift_setting_clear_orphan_shift_ids",
            """
UPDATE employee_attendance_shift_setting ss
SET
  sun_shift_id = CASE WHEN sun_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.sun_shift_id) THEN NULL ELSE sun_shift_id END,
  mon_shift_id = CASE WHEN mon_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.mon_shift_id) THEN NULL ELSE mon_shift_id END,
  tue_shift_id = CASE WHEN tue_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.tue_shift_id) THEN NULL ELSE tue_shift_id END,
  wed_shift_id = CASE WHEN wed_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.wed_shift_id) THEN NULL ELSE wed_shift_id END,
  thu_shift_id = CASE WHEN thu_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.thu_shift_id) THEN NULL ELSE thu_shift_id END,
  fri_shift_id = CASE WHEN fri_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.fri_shift_id) THEN NULL ELSE fri_shift_id END,
  sat_shift_id = CASE WHEN sat_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_shift s WHERE s.id = ss.sat_shift_id) THEN NULL ELSE sat_shift_id END;
""",
        ),
        (
            "emp_att_shift_setting_shift_id_fks",
            """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_sun_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_sun_shift_id FOREIGN KEY (sun_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_mon_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_mon_shift_id FOREIGN KEY (mon_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_tue_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_tue_shift_id FOREIGN KEY (tue_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_wed_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_wed_shift_id FOREIGN KEY (wed_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_thu_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_thu_shift_id FOREIGN KEY (thu_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_fri_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_fri_shift_id FOREIGN KEY (fri_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eass_sat_shift_id') THEN
    ALTER TABLE employee_attendance_shift_setting ADD CONSTRAINT fk_eass_sat_shift_id FOREIGN KEY (sat_shift_id) REFERENCES attendance_shift(id) ON DELETE RESTRICT;
  END IF;
END $$;
""",
        ),
        (
            "emp_att_shift_setting_shift_id_indexes",
            """
CREATE INDEX IF NOT EXISTS ix_eass_sun_shift_id ON employee_attendance_shift_setting(sun_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_mon_shift_id ON employee_attendance_shift_setting(mon_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_tue_shift_id ON employee_attendance_shift_setting(tue_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_wed_shift_id ON employee_attendance_shift_setting(wed_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_thu_shift_id ON employee_attendance_shift_setting(thu_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_fri_shift_id ON employee_attendance_shift_setting(fri_shift_id);
CREATE INDEX IF NOT EXISTS ix_eass_sat_shift_id ON employee_attendance_shift_setting(sat_shift_id);
""",
        ),
    ]:
        _run_ddl(engine, _sql, _lbl)

    # 근태 조회(타각) 원장
    for _lbl, _sql in [
        (
            "attendance_time_in_out_table",
            """
CREATE TABLE IF NOT EXISTS attendance_time_in_out (
  id_time_in_out BIGSERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  id_card VARCHAR(20),
  date_i TIMESTAMP,
  date_in_out TIMESTAMP,
  id_sin_out INTEGER,
  user_change VARCHAR(100),
  machine_no VARCHAR(20),
  location VARCHAR(255),
  add_memo VARCHAR(200),
  status_del BOOLEAN NOT NULL DEFAULT FALSE,
  id_time_in_out_approve BIGINT,
  sync_status VARCHAR(1),
  memo_ VARCHAR(250),
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);
""",
        ),
        (
            "attendance_time_in_out_location_col",
            "ALTER TABLE attendance_time_in_out ADD COLUMN IF NOT EXISTS location VARCHAR(255)",
        ),
        (
            "ix_attendance_time_in_out_employee",
            "CREATE INDEX IF NOT EXISTS ix_attendance_time_in_out_employee ON attendance_time_in_out(employee_id)",
        ),
        (
            "ix_attendance_time_in_out_company",
            "CREATE INDEX IF NOT EXISTS ix_attendance_time_in_out_company ON attendance_time_in_out(company_id)",
        ),
        (
            "ix_attendance_time_in_out_date_in_out",
            "CREATE INDEX IF NOT EXISTS ix_attendance_time_in_out_date_in_out ON attendance_time_in_out(date_in_out)",
        ),
    ]:
        _run_ddl(engine, _sql, _lbl)

    # 휴가등급별 누적·시작일 (attendance_leave_level 컬럼 보강 + 기존 전사 단일 global 백필)
    for _lbl, _sql in [
        (
            "att_leave_lv_statutory",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS statutory_start_date DATE",
        ),
        (
            "att_leave_lv_leave_other",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS leave_other_start_date DATE",
        ),
        (
            "att_leave_lv_cumulative_year",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS cumulative_year INTEGER",
        ),
        (
            "att_leave_lv_summer_plus",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS summer_employee_plus_one BOOLEAN NOT NULL DEFAULT FALSE",
        ),
        (
            "att_leave_lv_display_start",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS display_start_date DATE",
        ),
        (
            "att_leave_lv_thai_notice",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS thai_notice_text TEXT",
        ),
        (
            "att_leave_lv_cert_path",
            "ALTER TABLE attendance_leave_level ADD COLUMN IF NOT EXISTS certificate_web_path VARCHAR(500)",
        ),
    ]:
        _run_ddl(engine, _sql, _lbl)

    _run_ddl(
        engine,
        """
UPDATE attendance_leave_level ll SET
  statutory_start_date = COALESCE(ll.statutory_start_date, g.statutory_start_date),
  leave_other_start_date = COALESCE(ll.leave_other_start_date, g.leave_other_start_date),
  cumulative_year = COALESCE(ll.cumulative_year, g.cumulative_year),
  summer_employee_plus_one = ll.summer_employee_plus_one OR COALESCE(g.summer_employee_plus_one, FALSE),
  display_start_date = COALESCE(ll.display_start_date, g.display_start_date),
  thai_notice_text = COALESCE(NULLIF(TRIM(ll.thai_notice_text), ''), g.thai_notice_text),
  certificate_web_path = COALESCE(NULLIF(TRIM(ll.certificate_web_path), ''), g.certificate_web_path)
FROM attendance_leave_global g
WHERE ll.company_id = g.company_id
""",
        "att_leave_lv_backfill_from_global",
    )

    # —— audit_logs.user_id FK 보정 (users.id 참조) ——
    # master_data_service의 _log_audit(user_id=현재 users.id)를 위해 audit_logs.user_id FK를 users.id로 맞춥니다.
    _run_ddl(
        engine,
        """
DO $$
DECLARE c text;
BEGIN
  SELECT tc.constraint_name INTO c
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_name = kcu.table_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name='audit_logs'
    AND tc.table_schema='public'
    AND tc.constraint_type='FOREIGN KEY'
    AND kcu.column_name='user_id'
  LIMIT 1;

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', c);
  END IF;
END $$;
""",
        "audit_logs_drop_user_fk",
    )
    _run_ddl(
        engine,
        """
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id)
  ON DELETE SET NULL
  NOT VALID;
""",
        "audit_logs_fk_to_users",
    )

    # —— 증명서 직원 전달(토큰 링크) ——
    _run_ddl(
        engine,
        """
ALTER TABLE employee_certificate_issues
  ADD COLUMN IF NOT EXISTS employee_portal_opened_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS employee_portal_signed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS employee_portal_acknowledged_at TIMESTAMP
""",
        "employee_certificate_issues_portal_cols",
    )
    _run_ddl(
        engine,
        """
CREATE TABLE IF NOT EXISTS employee_certificate_delivery_tokens (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
  issue_id INTEGER NOT NULL REFERENCES employee_certificate_issues(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  opened_at TIMESTAMP,
  signed_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  signer_ip VARCHAR(45),
  signer_user_agent VARCHAR(512),
  CONSTRAINT uq_employee_certificate_delivery_token_hash UNIQUE (token_hash)
)
""",
        "employee_certificate_delivery_tokens",
    )
    _run_ddl(
        engine,
        "CREATE INDEX IF NOT EXISTS ix_ec_delivery_tokens_issue_id ON employee_certificate_delivery_tokens(issue_id)",
        "ix_ec_delivery_tokens_issue_id",
    )

    _run_ddl(
        engine,
        """
ALTER TABLE attendance_payroll_bucket_aggregate
  ADD COLUMN IF NOT EXISTS oth1_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth1_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth2_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth2_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth3_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth3_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth4_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth4_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth5_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth5_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth6_weekday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oth6_holiday INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS othb_weekday DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS othb_holiday DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_pay_local_weekday DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_pay_local_holiday DOUBLE PRECISION NOT NULL DEFAULT 0
""",
        "attendance_payroll_bucket_aggregate_ot_split",
    )

    print("✅ 스키마 보정 단계 완료")
