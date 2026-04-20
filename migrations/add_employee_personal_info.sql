-- 직원 개인정보 (직원당 1행)
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

CREATE INDEX IF NOT EXISTS ix_employee_personal_info_employee_id ON employee_personal_info(employee_id);
