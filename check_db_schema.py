"""데이터베이스 스키마 확인 스크립트"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db
from app.models.recruitment import JobPosting
from sqlalchemy import inspect

def check_job_posting_schema():
    """JobPosting 테이블의 컬럼 확인"""
    db = next(get_db())
    
    try:
        # SQLAlchemy Inspector를 사용하여 테이블 구조 확인
        inspector = inspect(db.bind)
        columns = inspector.get_columns('job_postings')
        
        print("=" * 80)
        print("JobPosting 테이블 컬럼 목록:")
        print("=" * 80)
        
        important_fields = [
            'experience_type', 'education', 'application_start_date', 
            'application_end_date', 'contact_person', 'contact_department',
            'contact_phone', 'contact_mobile', 'contact_email', 'contact_private',
            'recruitment_fields', 'job_role', 'working_hours', 'industry'
        ]
        
        found_fields = []
        missing_fields = []
        
        for col in columns:
            col_name = col['name']
            col_type = str(col['type'])
            nullable = col.get('nullable', True)
            
            print(f"  {col_name:30} | {col_type:20} | nullable: {nullable}")
            
            if col_name in important_fields:
                found_fields.append(col_name)
        
        print("\n" + "=" * 80)
        print("중요 필드 확인:")
        print("=" * 80)
        
        for field in important_fields:
            if field in found_fields:
                print(f"  ✓ {field}")
            else:
                print(f"  ✗ {field} (없음)")
                missing_fields.append(field)
        
        if missing_fields:
            print("\n" + "=" * 80)
            print("경고: 다음 필드가 데이터베이스에 없습니다!")
            print("=" * 80)
            for field in missing_fields:
                print(f"  - {field}")
            print("\n마이그레이션이 필요합니다.")
        else:
            print("\n모든 필드가 데이터베이스에 존재합니다.")
        
        # 실제 데이터 확인
        print("\n" + "=" * 80)
        print("최근 생성된 채용 공고 데이터 샘플:")
        print("=" * 80)
        
        recent_posting = db.query(JobPosting).order_by(JobPosting.created_at.desc()).first()
        if recent_posting:
            print(f"ID: {recent_posting.id}")
            print(f"제목: {recent_posting.title}")
            print(f"경력: {getattr(recent_posting, 'experience_type', 'N/A')}")
            print(f"학력: {getattr(recent_posting, 'education', 'N/A')}")
            print(f"접수 시작일: {getattr(recent_posting, 'application_start_date', 'N/A')}")
            print(f"접수 종료일: {getattr(recent_posting, 'application_end_date', 'N/A')}")
            print(f"담당자: {getattr(recent_posting, 'contact_person', 'N/A')}")
            print(f"담당자 전화: {getattr(recent_posting, 'contact_phone', 'N/A')}")
            print(f"담당자 이메일: {getattr(recent_posting, 'contact_email', 'N/A')}")
        else:
            print("저장된 채용 공고가 없습니다.")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_job_posting_schema()
