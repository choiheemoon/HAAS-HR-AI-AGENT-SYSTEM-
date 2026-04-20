"""채용 공고 응답 헬퍼 함수"""
from typing import Dict, Any
from app.models.recruitment import JobPosting


def job_posting_to_dict(job_posting: JobPosting) -> Dict[str, Any]:
    """JobPosting 모델을 딕셔너리로 변환 (모든 필드 포함)"""
    # 직접 속성 접근 시도, 없으면 None 반환
    def safe_getattr(obj, attr, default=None):
        try:
            # hasattr로 먼저 확인
            if not hasattr(obj, attr):
                return default
            value = getattr(obj, attr, default)
            # None도 유효한 값으로 반환 (프론트엔드에서 처리)
            return value
        except AttributeError:
            return default
    
    return {
        "id": job_posting.id,
        "title": job_posting.title,
        "department": safe_getattr(job_posting, 'department'),
        "position": safe_getattr(job_posting, 'position'),
        "job_level": safe_getattr(job_posting, 'job_level'),
        "location": safe_getattr(job_posting, 'location'),
        "employment_type": safe_getattr(job_posting, 'employment_type'),
        "description": safe_getattr(job_posting, 'description'),
        "requirements": safe_getattr(job_posting, 'requirements'),
        "responsibilities": safe_getattr(job_posting, 'responsibilities'),
        "benefits": safe_getattr(job_posting, 'benefits'),
        "salary_min": safe_getattr(job_posting, 'salary_min'),
        "salary_max": safe_getattr(job_posting, 'salary_max'),
        "currency": safe_getattr(job_posting, 'currency', 'KRW'),
        "status": safe_getattr(job_posting, 'status'),
        "posted_date": safe_getattr(job_posting, 'posted_date'),
        "closing_date": safe_getattr(job_posting, 'closing_date'),
        "ai_sourcing_enabled": safe_getattr(job_posting, 'ai_sourcing_enabled', True),
        "auto_parsing_enabled": safe_getattr(job_posting, 'auto_parsing_enabled', True),
        "job_sites": safe_getattr(job_posting, 'job_sites'),
        "public_slug": getattr(job_posting, 'public_slug', None),
        "created_at": job_posting.created_at,
        "updated_at": job_posting.updated_at,
        "application_count": len(job_posting.applications) if job_posting.applications else 0,
        # 새 필드들 (있으면 포함) - 명시적으로 접근
        "recruitment_fields": getattr(job_posting, 'recruitment_fields', None),
        "experience_type": getattr(job_posting, 'experience_type', None),
        "education": getattr(job_posting, 'education', None),
        "education_expected_graduate": getattr(job_posting, 'education_expected_graduate', False),
        "job_role": getattr(job_posting, 'job_role', None),
        "preferred_qualifications": safe_getattr(job_posting, 'preferred_qualifications'),
        "working_hours": safe_getattr(job_posting, 'working_hours'),
        "remote_work_available": safe_getattr(job_posting, 'remote_work_available', False),
        "overseas_location": safe_getattr(job_posting, 'overseas_location', False),
        "application_start_date": getattr(job_posting, 'application_start_date', None),
        "application_end_date": getattr(job_posting, 'application_end_date', None),
        "recruitment_process": getattr(job_posting, 'recruitment_process', None),
        "required_documents": getattr(job_posting, 'required_documents', None),
        "notes": getattr(job_posting, 'notes', None),
        "application_method": getattr(job_posting, 'application_method', None),
        "application_form": getattr(job_posting, 'application_form', None),
        "number_of_recruits": getattr(job_posting, 'number_of_recruits', None),
        "industry": getattr(job_posting, 'industry', None),
        "contact_person": getattr(job_posting, 'contact_person', None),
        "contact_department": getattr(job_posting, 'contact_department', None),
        "contact_phone": getattr(job_posting, 'contact_phone', None),
        "contact_mobile": getattr(job_posting, 'contact_mobile', None),
        "contact_email": getattr(job_posting, 'contact_email', None),
        "contact_private": getattr(job_posting, 'contact_private', None),
    }
