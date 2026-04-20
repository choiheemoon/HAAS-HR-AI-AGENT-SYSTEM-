"""채용 API"""
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.config import settings
from typing import List, Optional, Dict, Any
from app.database import get_db
from app.services.recruitment import RecruitmentService
from app.services.auth import AuthService
from app.schemas.recruitment import (
    JobPostingCreate, JobPostingUpdate, JobPostingResponse,
    PublishJobPostingRequest,
    ApplicationCreate, ApplicationResponse, ApplicationEvaluation,
    OfferLetterCreate, OfferLetterResponse,
    CandidateSearchRequest, CommunicationRequest,
    ParsedApplicationResponse,
    ParsedApplicationListResponse,
    ParsedApplicationDeleteRequest,
)
from app.api.v1.auth import get_current_user
from app.models.user import User
from app.api.v1.recruitment_helper import job_posting_to_dict

router = APIRouter()


@router.get("/job-postings", response_model=List[JobPostingResponse])
def get_job_postings(
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """채용 공고 목록 조회"""
    service = RecruitmentService(db)
    job_postings = service.get_job_postings(status)
    result = []
    for jp in job_postings:
        result.append(job_posting_to_dict(jp))
    return result


@router.get("/job-postings/{job_posting_id}", response_model=JobPostingResponse)
def get_job_posting(
    job_posting_id: int,
    db: Session = Depends(get_db)
):
    """채용 공고 상세 조회"""
    service = RecruitmentService(db)
    job_posting = service.get_job_posting(job_posting_id)
    if not job_posting:
        raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
    
    return job_posting_to_dict(job_posting)


@router.post("/job-postings", response_model=JobPostingResponse)
def create_job_posting(
    job_data: JobPostingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 생성 (인증 필수)"""
    import logging
    logger = logging.getLogger(__name__)
    
    # 디버깅: 받은 스키마 데이터 확인
    logger.info(f"[API] 채용 공고 생성 요청 - 사용자: {current_user.id}")
    logger.info(f"[API] 받은 스키마 데이터: {job_data}")
    
    service = RecruitmentService(db)
    job_dict = job_data.dict(exclude_unset=False)  # 모든 필드 포함
    
    # 디버깅: 변환된 딕셔너리 확인
    logger.info(f"[API] 변환된 딕셔너리: {job_dict}")
    logger.info(f"[API] 모집분야명: {job_dict.get('recruitment_fields')}")
    logger.info(f"[API] 경력: {job_dict.get('experience_type')}")
    logger.info(f"[API] 학력: {job_dict.get('education')}")
    logger.info(f"[API] 직무: {job_dict.get('job_role')}")
    logger.info(f"[API] 접수 시작일: {job_dict.get('application_start_date')}")
    logger.info(f"[API] 접수 종료일: {job_dict.get('application_end_date')}")
    logger.info(f"[API] 담당자: {job_dict.get('contact_person')}")
    logger.info(f"[API] 담당자 전화: {job_dict.get('contact_phone')}")
    logger.info(f"[API] 담당자 이메일: {job_dict.get('contact_email')}")
    
    job_posting = service.create_job_posting(job_dict)
    result = job_posting_to_dict(job_posting)
    
    # 디버깅: 반환할 데이터 확인
    logger.info(f"[API] 반환할 데이터 - 경력: {result.get('experience_type')}")
    logger.info(f"[API] 반환할 데이터 - 학력: {result.get('education')}")
    logger.info(f"[API] 반환할 데이터 - 접수 시작일: {result.get('application_start_date')}")
    logger.info(f"[API] 반환할 데이터 - 담당자: {result.get('contact_person')}")
    
    return result


@router.put("/job-postings/{job_posting_id}", response_model=JobPostingResponse)
def update_job_posting(
    job_posting_id: int,
    job_data: JobPostingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 수정"""
    service = RecruitmentService(db)
    try:
        job_posting = service.update_job_posting(job_posting_id, job_data.dict(exclude_unset=True))
        if not job_posting:
            raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return job_posting_to_dict(job_posting)


@router.delete("/job-postings/{job_posting_id}")
def delete_job_posting(
    job_posting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 삭제"""
    service = RecruitmentService(db)
    try:
        success = service.delete_job_posting(job_posting_id)
        if not success:
            raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
        return {"message": "채용 공고가 삭제되었습니다."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/job-postings/{job_posting_id}/request-approval", response_model=JobPostingResponse)
def request_approval(
    job_posting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 승인 요청 (DRAFT → PENDING_APPROVAL)"""
    service = RecruitmentService(db)
    try:
        job_posting = service.request_approval(job_posting_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return job_posting_to_dict(job_posting)


@router.post("/job-postings/{job_posting_id}/cancel-approval", response_model=JobPostingResponse)
def cancel_approval_request(
    job_posting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 승인 요청 취소 (PENDING_APPROVAL → DRAFT)"""
    service = RecruitmentService(db)
    try:
        job_posting = service.cancel_approval_request(job_posting_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return job_posting_to_dict(job_posting)


@router.post("/job-postings/{job_posting_id}/approve", response_model=JobPostingResponse)
def approve_job_posting(
    job_posting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 승인 (PENDING_APPROVAL → APPROVED)"""
    service = RecruitmentService(db)
    try:
        job_posting = service.approve_job_posting(job_posting_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return job_posting_to_dict(job_posting)


@router.post("/job-postings/{job_posting_id}/publish", response_model=JobPostingResponse)
def publish_job_posting(
    job_posting_id: int,
    body: PublishJobPostingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 배포 (APPROVED 상태만 배포 가능). 요청 본문에 job_sites(배포할 채용 사이트 목록) 전달."""
    service = RecruitmentService(db)
    try:
        job_posting = service.publish_job_posting(job_posting_id, body.job_sites or [])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return job_posting_to_dict(job_posting)


@router.post("/job-postings/{job_posting_id}/generate-public-url")
def generate_public_url(
    job_posting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채용 공고 공개 URL(slug) 생성. 이미 있으면 기존 slug 반환. 응답: public_slug, public_url."""
    service = RecruitmentService(db)
    try:
        job_posting, slug = service.generate_public_slug(job_posting_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not job_posting or not slug:
        raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없거나 slug 생성에 실패했습니다.")
    base = (settings.FRONTEND_URL or "").rstrip("/") or "http://localhost:3000"
    public_url = f"{base}/jobs/{slug}"
    return {"public_slug": slug, "public_url": public_url}


@router.get("/public/jobs/{slug}")
def get_public_job_posting(slug: str, db: Session = Depends(get_db)):
    """공개 채용 공고 조회 (인증 불필요). slug로 접근 가능한 공개 페이지용."""
    service = RecruitmentService(db)
    job_posting = service.get_job_posting_by_public_slug(slug)
    if not job_posting:
        raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
    return job_posting_to_dict(job_posting)


# apply-info를 apply보다 먼저 등록 (더 구체적인 경로 우선 매칭)
@router.post("/public/jobs/{slug}/apply-info")
def apply_to_public_job_info(
    slug: str,
    applicant_name: str = Form(...),
    applicant_email: str = Form(...),
    applicant_phone: Optional[str] = Form(None),
    applicant_surname: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    applied_position: Optional[str] = Form(None),
    date_of_birth: Optional[str] = Form(None),
    age: Optional[str] = Form(None),
    education: Optional[str] = Form(None),
    experience: Optional[str] = Form(None),
    skills: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),
    desired_salary: Optional[str] = Form(None),
    desired_positions: Optional[str] = Form(None),
    start_date_available: Optional[str] = Form(None),
    other_notes: Optional[str] = Form(None),
    document_language: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """공개 채용 공고 입사정보 등록 지원 (인증 불필요). 지원서 목록에 웹지원(form_type=6)으로 저장."""
    service = RecruitmentService(db)
    job_posting = service.get_job_posting_by_public_slug(slug)
    if not job_posting:
        raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
    data = {
        "applicant_name": applicant_name,
        "applicant_email": applicant_email,
        "applicant_phone": applicant_phone,
        "applicant_surname": applicant_surname,
        "address": address,
        "applied_position": applied_position,
        "date_of_birth": date_of_birth,
        "age": age,
        "education": education,
        "experience": experience,
        "skills": skills,
        "summary": summary,
        "gender": gender,
        "nationality": nationality,
        "desired_salary": desired_salary,
        "desired_positions": desired_positions,
        "start_date_available": start_date_available,
        "other_notes": other_notes,
        "document_language": document_language or "ko",
    }
    try:
        record = service.create_parsed_application_from_web(job_posting.id, data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "지원이 접수되었습니다.", "parsed_application_id": record.id}


@router.post("/public/jobs/{slug}/apply")
def apply_to_public_job(
    slug: str,
    name: str = Form(...),
    email: str = Form(...),
    phone: Optional[str] = Form(None),
    cover_letter: Optional[str] = Form(None),
    resume_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """공개 채용 공고 지원 - 서류 첨부 (인증 불필요). Form: name, email, phone?, cover_letter?, resume_file?"""
    service = RecruitmentService(db)
    job_posting = service.get_job_posting_by_public_slug(slug)
    if not job_posting:
        raise HTTPException(status_code=404, detail="채용 공고를 찾을 수 없습니다.")
    resume_file_path = None
    if resume_file and resume_file.filename:
        resume_file_path = service.save_resume_file(resume_file, job_posting.id)
    applicant_data = {"name": name, "email": email, "phone": phone or None, "cover_letter": cover_letter or None}
    try:
        application = service.create_application(job_posting.id, applicant_data, resume_file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "지원이 접수되었습니다.", "application_id": application.id}


@router.post("/job-postings/{job_posting_id}/applications", response_model=ApplicationResponse)
def create_application(
    job_posting_id: int,
    application_data: ApplicationCreate,
    resume_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """지원서 생성 (이력서 파일 업로드 지원)"""
    service = RecruitmentService(db)
    
    # 파일이 있으면 저장
    resume_file_path = None
    if resume_file:
        resume_file_path = service.save_resume_file(resume_file, job_posting_id)
    
    application = service.create_application(
        job_posting_id,
        application_data.dict(exclude={'resume_file_path'}),
        resume_file_path or application_data.resume_file_path
    )
    
    return {
        "id": application.id,
        "job_posting_id": application.job_posting_id,
        "applicant_id": application.applicant_id,
        "status": application.status,
        "applied_date": application.applied_date,
        "screening_score": application.screening_score,
        "evaluation_notes": application.evaluation_notes,
        "interview_scheduled_at": application.interview_scheduled_at,
        "interview_completed_at": application.interview_completed_at,
        "offer_letter_path": application.offer_letter_path,
        "offer_accepted": application.offer_accepted,
        "applicant": {
            "id": application.applicant.id,
            "name": application.applicant.name,
            "email": application.applicant.email,
            "phone": application.applicant.phone,
            "experience_years": application.applicant.experience_years,
            "education": application.applicant.education,
            "skills": application.applicant.skills,
            "ai_match_score": application.applicant.ai_match_score,
            "resume_file_path": application.applicant.resume_file_path,
            "created_at": application.applicant.created_at,
        } if application.applicant else None,
        "created_at": application.created_at,
    }


@router.get("/job-postings/{job_posting_id}/applications", response_model=List[ApplicationResponse])
def get_applications(
    job_posting_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """지원서 목록 조회"""
    service = RecruitmentService(db)
    applications = service.get_applications(job_posting_id, status)
    result = []
    for app in applications:
        result.append({
            "id": app.id,
            "job_posting_id": app.job_posting_id,
            "applicant_id": app.applicant_id,
            "status": app.status,
            "applied_date": app.applied_date,
            "screening_score": app.screening_score,
            "evaluation_notes": app.evaluation_notes,
            "interview_scheduled_at": app.interview_scheduled_at,
            "interview_completed_at": app.interview_completed_at,
            "offer_letter_path": app.offer_letter_path,
            "offer_accepted": app.offer_accepted,
            "applicant": {
                "id": app.applicant.id,
                "name": app.applicant.name,
                "email": app.applicant.email,
                "phone": app.applicant.phone,
                "experience_years": app.applicant.experience_years,
                "education": app.applicant.education,
                "skills": app.applicant.skills,
                "ai_match_score": app.applicant.ai_match_score,
                "resume_file_path": app.applicant.resume_file_path,
                "created_at": app.applicant.created_at,
            } if app.applicant else None,
            "created_at": app.created_at,
        })
    return result


@router.get("/applications/{application_id}", response_model=ApplicationResponse)
def get_application(
    application_id: int,
    db: Session = Depends(get_db)
):
    """지원서 상세 조회"""
    service = RecruitmentService(db)
    application = service.get_application(application_id)
    if not application:
        raise HTTPException(status_code=404, detail="지원서를 찾을 수 없습니다.")
    
    return {
        "id": application.id,
        "job_posting_id": application.job_posting_id,
        "applicant_id": application.applicant_id,
        "status": application.status,
        "applied_date": application.applied_date,
        "screening_score": application.screening_score,
        "evaluation_notes": application.evaluation_notes,
        "interview_scheduled_at": application.interview_scheduled_at,
        "interview_completed_at": application.interview_completed_at,
        "offer_letter_path": application.offer_letter_path,
        "offer_accepted": application.offer_accepted,
        "applicant": {
            "id": application.applicant.id,
            "name": application.applicant.name,
            "email": application.applicant.email,
            "phone": application.applicant.phone,
            "experience_years": application.applicant.experience_years,
            "education": application.applicant.education,
            "skills": application.applicant.skills,
            "ai_match_score": application.applicant.ai_match_score,
            "resume_file_path": application.applicant.resume_file_path,
            "created_at": application.applicant.created_at,
        } if application.applicant else None,
        "created_at": application.created_at,
    }


@router.put("/applications/{application_id}/evaluate", response_model=ApplicationResponse)
def evaluate_application(
    application_id: int,
    evaluation: ApplicationEvaluation,
    db: Session = Depends(get_db)
):
    """지원서 평가"""
    service = RecruitmentService(db)
    application = service.evaluate_application(application_id, evaluation.dict(exclude_unset=True))
    return {
        "id": application.id,
        "job_posting_id": application.job_posting_id,
        "applicant_id": application.applicant_id,
        "status": application.status,
        "applied_date": application.applied_date,
        "screening_score": application.screening_score,
        "evaluation_notes": application.evaluation_notes,
        "interview_scheduled_at": application.interview_scheduled_at,
        "interview_completed_at": application.interview_completed_at,
        "offer_letter_path": application.offer_letter_path,
        "offer_accepted": application.offer_accepted,
        "applicant": {
            "id": application.applicant.id,
            "name": application.applicant.name,
            "email": application.applicant.email,
            "phone": application.applicant.phone,
            "experience_years": application.applicant.experience_years,
            "education": application.applicant.education,
            "skills": application.applicant.skills,
            "ai_match_score": application.applicant.ai_match_score,
            "resume_file_path": application.applicant.resume_file_path,
            "created_at": application.applicant.created_at,
        } if application.applicant else None,
        "created_at": application.created_at,
    }


@router.post("/job-postings/{job_posting_id}/search-candidates")
def search_candidates(
    job_posting_id: int,
    search_request: CandidateSearchRequest,
    db: Session = Depends(get_db)
):
    """AI 소싱을 통한 후보자 검색"""
    service = RecruitmentService(db)
    candidates = service.search_candidates(job_posting_id, search_request.dict(exclude_unset=True))
    return candidates


@router.post("/applications/{application_id}/send-communication")
def send_communication(
    application_id: int,
    communication: CommunicationRequest,
    db: Session = Depends(get_db)
):
    """지원자에게 커뮤니케이션 전송 (이메일/SMS)"""
    service = RecruitmentService(db)
    result = service.send_communication(
        application_id,
        communication.message_type,
        communication.message,
        communication.subject,
        communication.template_id
    )
    return result


@router.post("/applications/{application_id}/offer-letter", response_model=OfferLetterResponse)
def create_offer_letter(
    application_id: int,
    offer_data: OfferLetterCreate,
    db: Session = Depends(get_db)
):
    """제안서 생성 및 발행"""
    service = RecruitmentService(db)
    result = service.create_and_send_offer_letter(application_id, offer_data.dict())
    return result


@router.post("/applications/{application_id}/accept-offer")
def accept_offer(
    application_id: int,
    signature_data: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db)
):
    """제안서 수락 및 전자 서명"""
    service = RecruitmentService(db)
    result = service.accept_offer(application_id, signature_data or {})
    return result


@router.post("/applications/{application_id}/parse-resume")
def parse_resume(
    application_id: int,
    resume_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """이력서 파싱 (ATS)"""
    service = RecruitmentService(db)
    result = service.parse_and_update_resume(application_id, resume_file)
    return result


# ----- 지원서 접수 및 파싱 (이메일 접수 PDF 업로드 → 파싱 → parsed_applications 테이블 저장) -----

def _normalize_parsed_data_education(pa) -> dict:
    """parsed_data.education_entries가 비었거나 불완전할 때 DB 상위 필드(education_level, faculty, major 등)로 보완."""
    raw_pd = getattr(pa, "parsed_data", None)
    pd = dict(raw_pd) if isinstance(raw_pd, dict) else {}
    entries = list(pd.get("education_entries") or [])
    top_edu = getattr(pa, "education_level", None)
    top_faculty = getattr(pa, "faculty", None)
    top_major = getattr(pa, "major", None)
    top_qual = getattr(pa, "qualification", None)
    top_gpa = getattr(pa, "gpa", None)
    has_top = any(v and str(v).strip() for v in (top_edu, top_faculty, top_major, top_qual, top_gpa))
    if not entries and has_top:
        entries = [{
            "institution": None,
            "year": None,
            "education_level": top_edu,
            "faculty": top_faculty,
            "major": top_major,
            "qualification": top_qual,
            "gpa": top_gpa,
        }]
    elif entries:
        first = dict(entries[0])
        if not (first.get("education_level") or "").strip() and top_edu:
            first["education_level"] = top_edu
        if not (first.get("faculty") or "").strip() and top_faculty:
            first["faculty"] = top_faculty
        if not (first.get("major") or "").strip() and top_major:
            first["major"] = top_major
        if not (first.get("qualification") or "").strip() and top_qual:
            first["qualification"] = top_qual
        if not (first.get("gpa") or "").strip() and top_gpa:
            first["gpa"] = top_gpa
        entries[0] = first
    if entries is not None:
        pd["education_entries"] = entries
    return pd

def _parsed_application_to_dict(pa) -> dict:
    """ParsedApplication 모델을 API 응답 딕셔너리로 변환 (파싱 항목별 필드 포함)"""
    return {
        "id": pa.id,
        "original_filename": pa.original_filename,
        "pdf_file_path": pa.pdf_file_path,
        "form_type": pa.form_type,
        "document_language": pa.document_language,
        "applicant_name": pa.applicant_name,
        "applicant_surname": getattr(pa, "applicant_surname", None),
        "applicant_email": pa.applicant_email,
        "applicant_phone": pa.applicant_phone,
        "applicant_id": getattr(pa, "applicant_id", None),
        "age": getattr(pa, "age", None),
        "application_date": getattr(pa, "application_date", None),
        "company_name": getattr(pa, "company_name", None),
        "business_type": getattr(pa, "business_type", None),
        "applied_position": getattr(pa, "applied_position", None),
        "position": getattr(pa, "position", None),
        "employment_period": getattr(pa, "employment_period", None),
        "salary": getattr(pa, "salary", None),
        "address": getattr(pa, "address", None),
        "education": getattr(pa, "education", None),
        "experience": getattr(pa, "experience", None),
        "skills": getattr(pa, "skills", None),
        "summary": getattr(pa, "summary", None),
        "sections_intro": getattr(pa, "sections_intro", None),
        "sections_skills": getattr(pa, "sections_skills", None),
        "sections_experience": getattr(pa, "sections_experience", None),
        "sections_education": getattr(pa, "sections_education", None),
        "date_of_birth": getattr(pa, "date_of_birth", None),
        "nationality": getattr(pa, "nationality", None),
        "gender": getattr(pa, "gender", None),
        "certification_license": getattr(pa, "certification_license", None),
        "linkedin_url": getattr(pa, "linkedin_url", None),
        "update_date": getattr(pa, "update_date", None),
        "height_weight": getattr(pa, "height_weight", None),
        "height": getattr(pa, "height", None),
        "weight": getattr(pa, "weight", None),
        "religion": getattr(pa, "religion", None),
        "marital_status": getattr(pa, "marital_status", None),
        "desired_salary": getattr(pa, "desired_salary", None),
        "military_status": getattr(pa, "military_status", None),
        "facebook_url": getattr(pa, "facebook_url", None),
        "line_id": getattr(pa, "line_id", None),
        "desired_work_locations": getattr(pa, "desired_work_locations", None),
        "employment_type_preference": getattr(pa, "employment_type_preference", None),
        "can_work_bangkok": getattr(pa, "can_work_bangkok", None),
        "can_work_provinces": getattr(pa, "can_work_provinces", None),
        "willing_work_abroad": getattr(pa, "willing_work_abroad", None),
        "occupation_field": getattr(pa, "occupation_field", None),
        "sub_occupation": getattr(pa, "sub_occupation", None),
        "vehicles_owned": getattr(pa, "vehicles_owned", None),
        "driving_license": getattr(pa, "driving_license", None),
        "driving_ability": getattr(pa, "driving_ability", None),
        "language_skills": getattr(pa, "language_skills", None),
        "training_info": getattr(pa, "training_info", None),
        "start_date_available": getattr(pa, "start_date_available", None),
        "desired_positions": getattr(pa, "desired_positions", None),
        "education_level": getattr(pa, "education_level", None),
        "faculty": getattr(pa, "faculty", None),
        "major": getattr(pa, "major", None),
        "qualification": getattr(pa, "qualification", None),
        "gpa": getattr(pa, "gpa", None),
        "other_notes": getattr(pa, "other_notes", None),
        "last_working_1": getattr(pa, "last_working_1", None),
        "lw1_period": getattr(pa, "lw1_period", None),
        "last_working_2": getattr(pa, "last_working_2", None),
        "lw2_period": getattr(pa, "lw2_period", None),
        "last_working_3": getattr(pa, "last_working_3", None),
        "lw3_period": getattr(pa, "lw3_period", None),
        "parsed_data": _normalize_parsed_data_education(pa),
        "raw_text": pa.raw_text[:2000] if pa.raw_text else None,
        "job_posting_id": pa.job_posting_id,
        "job_posting_title": pa.job_posting.title if getattr(pa, "job_posting", None) else None,
        "status": pa.status,
        "created_at": pa.created_at,
        "updated_at": pa.updated_at,
        "created_by": (getattr(pa.creator, "full_name", None) or getattr(pa.creator, "username", None)) if getattr(pa, "creator", None) else None,
    }


@router.post("/parsed-applications/upload", response_model=ParsedApplicationResponse)
def upload_and_parse_application(
    pdf_file: UploadFile = File(...),
    form_type: Optional[int] = None,
    document_language: Optional[str] = None,
    job_posting_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """이메일 접수 지원서(PDF) 업로드 후 파싱하여 테이블에 자동 저장. 지원서 종류 1~5, 언어 ko/en/th, 채용공고 연결 선택."""
    if not pdf_file.filename or not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")
    try:
        service = RecruitmentService(db)
        record = service.upload_and_parse_application(
            pdf_file,
            form_type_hint=form_type if form_type in (1, 2, 3, 4, 5) else None,
            language_hint=document_language or None,
            job_posting_id=job_posting_id,
            created_by_id=current_user.id,
        )
        return _parsed_application_to_dict(record)
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.exception("parsed-applications/upload failed")
        msg = str(e).strip()
        # 사용자에게 보여줄 짧은 메시지 (첫 줄 또는 300자)
        if "\n" in msg:
            msg = msg.split("\n")[0].strip()
        if len(msg) > 400:
            msg = msg[:400] + "..."
        # 흔한 원인 설명
        if "NUL" in msg or "null byte" in msg.lower() or "0x00" in msg:
            msg = "PDF 또는 추출된 텍스트에 제어 문자(NUL)가 포함되어 저장할 수 없습니다. 해당 PDF를 다른 프로그램으로 다시 저장한 뒤 업로드해 보세요."
        elif "could not decode" in msg.lower() or "encoding" in msg.lower() or "utf-8" in msg.lower():
            msg = f"PDF 텍스트 인코딩 오류: {msg}"
        elif "pdf" in msg.lower() and ("invalid" in msg.lower() or "corrupt" in msg.lower() or "read" in msg.lower()):
            msg = f"PDF 파일을 읽을 수 없습니다. (손상되었거나 이미지 기반 PDF일 수 있음): {msg}"
        else:
            msg = f"업로드·파싱 처리 중 오류가 발생했습니다: {msg}"
        raise HTTPException(status_code=500, detail=msg)


@router.get("/parsed-applications", response_model=ParsedApplicationListResponse)
def get_parsed_applications(
    form_type: Optional[int] = None,
    document_language: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """파싱된 지원서 목록 조회 (지원서 목록 메뉴용, 페이지네이션)"""
    service = RecruitmentService(db)
    items, total = service.get_parsed_applications(
        form_type=form_type,
        document_language=document_language,
        status=status,
        limit=limit,
        skip=skip,
    )
    return ParsedApplicationListResponse(
        items=[_parsed_application_to_dict(item) for item in items],
        total=total,
    )


@router.post("/parsed-applications/bulk-delete")
def bulk_delete_parsed_applications(
    body: ParsedApplicationDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """선택한 파싱된 지원서 일괄 삭제 (POST, 경로를 {id}보다 먼저 선언해 405 방지)"""
    if not body.ids:
        return {"deleted": 0, "message": "삭제할 항목이 없습니다."}
    try:
        service = RecruitmentService(db)
        deleted = service.delete_parsed_applications(body.ids)
        return {"deleted": deleted, "message": f"{deleted}건 삭제되었습니다."}
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).exception("bulk-delete parsed_applications failed")
        msg = str(e).strip() or "삭제 처리 중 오류가 발생했습니다."
        if len(msg) > 200:
            msg = msg[:200] + "..."
        raise HTTPException(status_code=500, detail=msg)


@router.delete("/parsed-applications")
def delete_parsed_applications(
    body: ParsedApplicationDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """선택한 파싱된 지원서 일괄 삭제 (DELETE + body가 차단되는 환경에서는 POST /parsed-applications/bulk-delete 사용)"""
    if not body.ids:
        return {"deleted": 0, "message": "삭제할 항목이 없습니다."}
    service = RecruitmentService(db)
    deleted = service.delete_parsed_applications(body.ids)
    return {"deleted": deleted, "message": f"{deleted}건 삭제되었습니다."}


@router.get("/parsed-applications/{parsed_application_id}", response_model=ParsedApplicationResponse)
def get_parsed_application(
    parsed_application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """파싱된 지원서 상세 조회"""
    service = RecruitmentService(db)
    record = service.get_parsed_application(parsed_application_id)
    if not record:
        raise HTTPException(status_code=404, detail="파싱된 지원서를 찾을 수 없습니다.")
    return _parsed_application_to_dict(record)


@router.get("/parsed-applications/{parsed_application_id}/file")
def get_parsed_application_file(
    parsed_application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """파싱된 지원서의 원본 PDF 첨부파일 다운로드/열람"""
    service = RecruitmentService(db)
    record = service.get_parsed_application(parsed_application_id)
    if not record:
        raise HTTPException(status_code=404, detail="파싱된 지원서를 찾을 수 없습니다.")
    base_dir = Path(settings.STORAGE_PATH or "./storage").resolve()
    # 경로 정규화: Windows 역슬래시 및 절대경로 혼용 대비
    stored = (record.pdf_file_path or "").strip().replace("\\", "/")
    path = Path(stored)
    if path.is_file():
        path = path.resolve()
    elif stored and (base_dir / stored).is_file():
        path = (base_dir / stored).resolve()
    else:
        # 파일명만으로 재탐색 (상대/절대 경로 혼용 저장 데이터 대비)
        name = path.name or (stored.split("/")[-1] if "/" in stored else stored)
        if name and (base_dir / "parsed_applications" / name).is_file():
            path = (base_dir / "parsed_applications" / name).resolve()
        else:
            raise HTTPException(status_code=404, detail="원본 파일을 찾을 수 없습니다.")
    filename = record.original_filename or "application.pdf"
    if not filename.lower().endswith(".pdf"):
        filename = filename + ".pdf"
    # HTTP 헤더는 latin-1만 허용 → 한글/태국어 등은 RFC 5987 filename* 로 전달
    try:
        ascii_name = filename.encode("ascii").decode("ascii")
        content_disp = f'inline; filename="{ascii_name}"'
    except UnicodeEncodeError:
        content_disp = f'inline; filename="application.pdf"; filename*=UTF-8\'\'{quote(filename)}'
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename="application.pdf",
        headers={"Content-Disposition": content_disp},
    )
