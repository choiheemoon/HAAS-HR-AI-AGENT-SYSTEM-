"""parsed_applications 테이블 생성 스크립트 (지원서 접수 및 파싱)"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
from sqlalchemy import text

def create_table():
    sql = """
    CREATE TABLE IF NOT EXISTS parsed_applications (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        original_filename VARCHAR(255) NOT NULL,
        pdf_file_path VARCHAR(500) NOT NULL,
        form_type INTEGER NOT NULL DEFAULT 1,
        document_language VARCHAR(10) NOT NULL DEFAULT 'ko',
        applicant_name VARCHAR(200),
        applicant_email VARCHAR(255),
        applicant_phone VARCHAR(50),
        parsed_data JSONB,
        raw_text TEXT,
        job_posting_id INTEGER REFERENCES job_postings(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'parsed'
    );
    """
    index_sqls = [
        "CREATE INDEX IF NOT EXISTS idx_parsed_applications_form_type ON parsed_applications(form_type);",
        "CREATE INDEX IF NOT EXISTS idx_parsed_applications_document_language ON parsed_applications(document_language);",
        "CREATE INDEX IF NOT EXISTS idx_parsed_applications_status ON parsed_applications(status);",
        "CREATE INDEX IF NOT EXISTS idx_parsed_applications_applicant_email ON parsed_applications(applicant_email);",
        "CREATE INDEX IF NOT EXISTS idx_parsed_applications_created_at ON parsed_applications(created_at DESC);",
    ]
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
        for ix in index_sqls:
            try:
                conn.execute(text(ix))
                conn.commit()
            except Exception as e:
                print(f"Index (may exist): {e}")
    print("parsed_applications 테이블 생성 완료.")

if __name__ == "__main__":
    create_table()
