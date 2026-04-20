"""parsed_applications 테이블에 파싱 항목별 필드 추가"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
from sqlalchemy import text

STATEMENTS = [
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS company_name VARCHAR(300);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS business_type VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS position VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS employment_period VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS salary VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS address TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS education TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS experience TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS skills TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS summary TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS sections_intro TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS sections_skills TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS sections_experience TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS sections_education TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(50);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS gender VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS certification_license TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS update_date VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS height_weight VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS height VARCHAR(50);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS weight VARCHAR(50);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS religion VARCHAR(50);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS desired_salary VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS military_status VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS line_id VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS desired_work_locations TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS employment_type_preference VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS can_work_bangkok VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS can_work_provinces VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS willing_work_abroad VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS occupation_field VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS sub_occupation VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS vehicles_owned TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS driving_license TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS driving_ability TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS language_skills TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS training_info TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS applicant_id VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS age VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS application_date VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS start_date_available VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS desired_positions TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS education_level VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS faculty VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS major VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS qualification VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS gpa VARCHAR(20);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS other_notes TEXT;",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS applicant_surname VARCHAR(200);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS applied_position VARCHAR(300);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_1 VARCHAR(300);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw1_period VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_2 VARCHAR(300);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw2_period VARCHAR(100);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS last_working_3 VARCHAR(300);",
    "ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS lw3_period VARCHAR(100);",
]

def run():
    with engine.connect() as conn:
        for sql in STATEMENTS:
            conn.execute(text(sql))
            conn.commit()
    print("parsed_applications 파싱 항목 필드 추가 완료.")

if __name__ == "__main__":
    run()
