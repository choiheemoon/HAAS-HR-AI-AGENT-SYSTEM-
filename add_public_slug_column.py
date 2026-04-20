"""job_postings 테이블에 public_slug 컬럼 추가 (웹 공개 URL용)"""
import os
import sys

# app 없이 DB URL만 사용 (임포트 시 다른 모듈의 유니코드 출력 방지)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:Atech123%21%40%23@127.0.0.1:5433/AI_HR")

from sqlalchemy import create_engine, text

def main():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE job_postings
            ADD COLUMN IF NOT EXISTS public_slug VARCHAR(50)
        """))
        conn.commit()
        print("OK: public_slug column added (or already exists)")
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_job_postings_public_slug
            ON job_postings (public_slug)
            WHERE public_slug IS NOT NULL
        """))
        conn.commit()
        print("OK: ix_job_postings_public_slug index created (or already exists)")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
