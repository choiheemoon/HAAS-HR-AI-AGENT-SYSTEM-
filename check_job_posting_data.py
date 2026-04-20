"""채용 공고 데이터 확인 스크립트"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db
from app.models.recruitment import JobPosting

def check_job_posting_data():
    """저장된 채용 공고 데이터 확인"""
    db = next(get_db())
    
    try:
        # 최근 생성된 채용 공고 조회
        job_postings = db.query(JobPosting).order_by(JobPosting.created_at.desc()).limit(5).all()
        
        print("=" * 80)
        print("저장된 채용 공고 데이터 확인")
        print("=" * 80)
        
        if not job_postings:
            print("저장된 채용 공고가 없습니다.")
        else:
            for idx, job in enumerate(job_postings, 1):
                print(f"\n[{idx}] 채용 공고 ID: {job.id}")
                print(f"  제목: {job.title}")
                print(f"  상태: {job.status}")
                print(f"  생성일: {job.created_at}")
                print("-" * 80)
                print("  중요 필드 확인:")
                print(f"    모집분야명 (recruitment_fields): {getattr(job, 'recruitment_fields', None)}")
                print(f"    경력 (experience_type): {getattr(job, 'experience_type', None)}")
                print(f"    학력 (education): {getattr(job, 'education', None)}")
                print(f"    직무 (job_role): {getattr(job, 'job_role', None)}")
                print(f"    접수 시작일 (application_start_date): {getattr(job, 'application_start_date', None)}")
                print(f"    접수 종료일 (application_end_date): {getattr(job, 'application_end_date', None)}")
                print(f"    담당자 (contact_person): {getattr(job, 'contact_person', None)}")
                print(f"    담당자 전화 (contact_phone): {getattr(job, 'contact_phone', None)}")
                print(f"    담당자 이메일 (contact_email): {getattr(job, 'contact_email', None)}")
                print(f"    고용형태 (employment_type): {getattr(job, 'employment_type', None)}")
                print(f"    업종 (industry): {getattr(job, 'industry', None)}")
                print("-" * 80)
        
    except Exception as e:
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_job_posting_data()
