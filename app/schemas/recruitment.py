"""채용 관련 스키마"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Dict, Any, Union
from datetime import date, datetime


class JobPostingBase(BaseModel):
    """채용 공고 기본 스키마"""
    title: str
    department: Optional[str] = None
    position: Optional[str] = None
    job_level: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[Union[str, Dict[str, Any]]] = None
    responsibilities: Optional[str] = None
    benefits: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "KRW"
    closing_date: Optional[date] = None
    ai_sourcing_enabled: bool = True
    auto_parsing_enabled: bool = True
    job_sites: Optional[List[str]] = None
    
    # 추가 필드 (새 양식)
    recruitment_fields: Optional[List[str]] = None  # 모집분야명
    experience_type: Optional[str] = None  # 신입/경력/경력무관
    education: Optional[str] = None  # 학력
    education_expected_graduate: bool = False  # 졸업예정자 가능
    job_role: Optional[str] = None  # 직무
    preferred_qualifications: Optional[str] = None  # 우대사항
    working_hours: Optional[int] = None  # 주 근무시간
    remote_work_available: bool = False  # 재택근무 가능
    overseas_location: bool = False  # 해외지역
    application_start_date: Optional[date] = None  # 접수 시작일
    application_end_date: Optional[date] = None  # 접수 종료일
    recruitment_process: Optional[List[str]] = None  # 채용절차
    required_documents: Optional[str] = None  # 제출서류
    notes: Optional[str] = None  # 유의사항
    application_method: Optional[List[str]] = None  # 접수방법
    application_form: Optional[str] = None  # 지원서 양식
    number_of_recruits: Optional[int] = None  # 모집인원
    industry: Optional[List[str]] = None  # 업종
    contact_person: Optional[str] = None  # 담당자
    contact_department: Optional[str] = None  # 부서명
    contact_phone: Optional[str] = None  # 전화번호
    contact_mobile: Optional[str] = None  # 휴대폰번호
    contact_email: Optional[str] = None  # 이메일
    contact_private: Optional[Dict[str, bool]] = None  # 비공개 설정
    
    @field_validator('requirements', mode='before')
    @classmethod
    def validate_requirements(cls, v):
        """requirements를 문자열로 변환"""
        if v is None:
            return None
        if isinstance(v, dict):
            # 딕셔너리인 경우 문자열로 변환 (JSON 직렬화)
            import json
            return json.dumps(v, ensure_ascii=False)
        if isinstance(v, str):
            return v
        return str(v)


class JobPostingCreate(JobPostingBase):
    """채용 공고 생성 스키마"""
    pass


class JobPostingUpdate(JobPostingBase):
    """채용 공고 수정 스키마 - JobPostingBase를 상속하여 모든 필드 수정 가능"""
    # 모든 필드가 Optional이므로 BaseModel의 필드들을 그대로 사용
    pass


class PublishJobPostingRequest(BaseModel):
    """채용 공고 배포 요청 스키마 (배포할 채용 사이트 목록)"""
    job_sites: List[str] = []


class JobPostingResponse(JobPostingBase):
    """채용 공고 응답 스키마"""
    id: int
    status: str
    posted_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    application_count: Optional[int] = 0

    class Config:
        from_attributes = True


class ApplicantBase(BaseModel):
    """지원자 기본 스키마"""
    name: str
    email: EmailStr
    phone: Optional[str] = None
    cover_letter: Optional[str] = None


class ApplicantCreate(ApplicantBase):
    """지원자 생성 스키마"""
    resume_file_path: Optional[str] = None


class ApplicantResponse(ApplicantBase):
    """지원자 응답 스키마"""
    id: int
    experience_years: Optional[int] = None
    education: Optional[Dict[str, Any]] = None
    skills: Optional[List[str]] = None
    ai_match_score: Optional[float] = None
    resume_file_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApplicationBase(BaseModel):
    """지원서 기본 스키마"""
    job_posting_id: int
    applicant_id: Optional[int] = None
    status: Optional[str] = None


class ApplicationCreate(BaseModel):
    """지원서 생성 스키마"""
    job_posting_id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    cover_letter: Optional[str] = None
    resume_file_path: Optional[str] = None


class ApplicationResponse(ApplicationBase):
    """지원서 응답 스키마"""
    id: int
    applicant_id: int
    applied_date: date
    screening_score: Optional[float] = None
    evaluation_notes: Optional[str] = None
    interview_scheduled_at: Optional[date] = None
    interview_completed_at: Optional[date] = None
    offer_letter_path: Optional[str] = None
    offer_accepted: bool = False
    applicant: Optional[ApplicantResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApplicationEvaluation(BaseModel):
    """지원서 평가 스키마"""
    score: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class OfferLetterCreate(BaseModel):
    """제안서 생성 스키마"""
    position: str
    salary: float
    start_date: date
    benefits: Optional[Dict[str, Any]] = None
    terms: Optional[str] = None


class OfferLetterResponse(BaseModel):
    """제안서 응답 스키마"""
    offer_letter_path: str
    offer_letter_content: str
    signed: bool = False
    signed_at: Optional[datetime] = None


class CandidateSearchRequest(BaseModel):
    """후보자 검색 요청 스키마"""
    skills: Optional[List[str]] = None
    experience_years_min: Optional[int] = None
    education_level: Optional[str] = None
    location: Optional[str] = None


class CommunicationRequest(BaseModel):
    """커뮤니케이션 요청 스키마"""
    application_id: int
    message_type: str  # email, sms, etc.
    subject: Optional[str] = None
    message: str
    template_id: Optional[str] = None


# ----- 지원서 접수 및 파싱 (이메일 접수 PDF → 파싱 → parsed_applications) -----

class ParsedApplicationResponse(BaseModel):
    """파싱된 지원서 응답 스키마 (파싱 항목별 필드 포함)"""
    id: int
    original_filename: str
    pdf_file_path: str
    form_type: int
    document_language: str
    applicant_name: Optional[str] = None
    applicant_surname: Optional[str] = None
    applicant_email: Optional[str] = None
    applicant_phone: Optional[str] = None
    applicant_id: Optional[str] = None
    age: Optional[str] = None
    application_date: Optional[str] = None
    company_name: Optional[str] = None
    business_type: Optional[str] = None
    applied_position: Optional[str] = None
    position: Optional[str] = None
    employment_period: Optional[str] = None
    salary: Optional[str] = None
    address: Optional[str] = None
    education: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[str] = None
    summary: Optional[str] = None
    sections_intro: Optional[str] = None
    sections_skills: Optional[str] = None
    sections_experience: Optional[str] = None
    sections_education: Optional[str] = None
    date_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    gender: Optional[str] = None
    certification_license: Optional[str] = None
    linkedin_url: Optional[str] = None
    update_date: Optional[str] = None
    height_weight: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    religion: Optional[str] = None
    marital_status: Optional[str] = None
    desired_salary: Optional[str] = None
    military_status: Optional[str] = None
    facebook_url: Optional[str] = None
    line_id: Optional[str] = None
    desired_work_locations: Optional[str] = None
    employment_type_preference: Optional[str] = None
    can_work_bangkok: Optional[str] = None
    can_work_provinces: Optional[str] = None
    willing_work_abroad: Optional[str] = None
    occupation_field: Optional[str] = None
    sub_occupation: Optional[str] = None
    vehicles_owned: Optional[str] = None
    driving_license: Optional[str] = None
    driving_ability: Optional[str] = None
    language_skills: Optional[str] = None
    training_info: Optional[str] = None
    start_date_available: Optional[str] = None
    desired_positions: Optional[str] = None
    education_level: Optional[str] = None
    faculty: Optional[str] = None
    major: Optional[str] = None
    qualification: Optional[str] = None
    gpa: Optional[str] = None
    other_notes: Optional[str] = None
    last_working_1: Optional[str] = None
    lw1_period: Optional[str] = None
    last_working_2: Optional[str] = None
    lw2_period: Optional[str] = None
    last_working_3: Optional[str] = None
    lw3_period: Optional[str] = None
    parsed_data: Optional[Dict[str, Any]] = None
    raw_text: Optional[str] = None
    job_posting_id: Optional[int] = None
    job_posting_title: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None  # 등록자 (full_name or username)

    class Config:
        from_attributes = True


class ParsedApplicationListResponse(BaseModel):
    """파싱된 지원서 목록 페이지네이션 응답"""
    items: List[ParsedApplicationResponse]
    total: int


class ParsedApplicationDeleteRequest(BaseModel):
    """파싱된 지원서 일괄 삭제 요청"""
    ids: List[int]

    @field_validator("ids", mode="before")
    @classmethod
    def coerce_ids_to_int(cls, v):
        if isinstance(v, list):
            out = []
            for x in v:
                if x is None or (isinstance(x, str) and not x.strip()):
                    continue
                try:
                    out.append(int(x))
                except (ValueError, TypeError):
                    continue
            return out
        return []
