"""데이터베이스에 새 필드 추가 스크립트"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db
from sqlalchemy import text

def add_job_posting_fields():
    """job_postings 테이블에 새 필드 추가"""
    db = next(get_db())
    
    try:
        # SQL 실행
        sql_statements = [
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS recruitment_fields JSON",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS experience_type VARCHAR(50)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education VARCHAR(100)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education_expected_graduate BOOLEAN DEFAULT FALSE",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS job_role VARCHAR(100)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS preferred_qualifications TEXT",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS working_hours INTEGER",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS remote_work_available BOOLEAN DEFAULT FALSE",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS overseas_location BOOLEAN DEFAULT FALSE",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_start_date DATE",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_end_date DATE",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS recruitment_process JSON",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS required_documents TEXT",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS notes TEXT",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_method JSON",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_form VARCHAR(100)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS number_of_recruits INTEGER",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS industry JSON",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_department VARCHAR(100)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_mobile VARCHAR(50)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255)",
            "ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS contact_private JSON",
        ]
        
        print("=" * 80)
        print("job_postings 테이블에 새 필드 추가 중...")
        print("=" * 80)
        
        for sql in sql_statements:
            try:
                db.execute(text(sql))
                print(f"✓ {sql.split('ADD COLUMN IF NOT EXISTS')[1].strip()}")
            except Exception as e:
                print(f"✗ 오류: {sql}")
                print(f"  {e}")
        
        db.commit()
        print("\n" + "=" * 80)
        print("모든 필드 추가 완료!")
        print("=" * 80)
        
        # 확인
        result = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'job_postings'
            AND column_name IN (
                'recruitment_fields', 'experience_type', 'education', 'education_expected_graduate',
                'job_role', 'preferred_qualifications', 'working_hours', 'remote_work_available',
                'overseas_location', 'application_start_date', 'application_end_date',
                'recruitment_process', 'required_documents', 'notes', 'application_method',
                'application_form', 'number_of_recruits', 'industry', 'contact_person',
                'contact_department', 'contact_phone', 'contact_mobile', 'contact_email',
                'contact_private'
            )
            ORDER BY column_name
        """))
        
        print("\n추가된 컬럼 확인:")
        print("-" * 80)
        for row in result:
            print(f"  {row[0]:30} | {row[1]:20} | nullable: {row[2]}")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_job_posting_fields()
