"""채용 모델"""
from sqlalchemy import Column, String, Date, Integer, Float, Boolean, ForeignKey, Text, JSON, Enum
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
import enum
from datetime import date


class JobStatus(enum.Enum):
    """채용 공고 상태"""
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PUBLISHED = "published"
    CLOSED = "closed"


class ApplicationStatus(enum.Enum):
    """지원 상태"""
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    OFFERED = "offered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class JobPosting(BaseModel):
    """채용 공고"""
    __tablename__ = "job_postings"
    
    title = Column(String(200), nullable=False)
    department = Column(String(100))
    position = Column(String(100))
    job_level = Column(String(50))
    location = Column(String(100))
    employment_type = Column(String(50))
    
    description = Column(Text)
    requirements = Column(Text)
    responsibilities = Column(Text)
    benefits = Column(Text)
    
    salary_min = Column(Float)
    salary_max = Column(Float)
    currency = Column(String(10), default="KRW")
    
    status = Column(String(50), default=JobStatus.DRAFT.value)
    posted_date = Column(Date)
    closing_date = Column(Date)
    
    # AI 관련
    ai_sourcing_enabled = Column(Boolean, default=True)
    auto_parsing_enabled = Column(Boolean, default=True)
    job_sites = Column(JSON)  # 배포할 채용 사이트 목록
    # 웹 공개 URL (로그인 없이 조회용)
    public_slug = Column(String(50), unique=True, nullable=True, index=True)
    
    # 추가 필드 (새 양식)
    recruitment_fields = Column(JSON)  # 모집분야명 (여러 개)
    experience_type = Column(String(50))  # 신입/경력/경력무관
    education = Column(String(100))  # 학력
    education_expected_graduate = Column(Boolean, default=False)  # 졸업예정자 가능
    job_role = Column(String(100))  # 직무
    preferred_qualifications = Column(Text)  # 우대사항
    working_hours = Column(Integer)  # 주 근무시간
    remote_work_available = Column(Boolean, default=False)  # 재택근무 가능
    overseas_location = Column(Boolean, default=False)  # 해외지역
    application_start_date = Column(Date)  # 접수 시작일
    application_end_date = Column(Date)  # 접수 종료일
    recruitment_process = Column(JSON)  # 채용절차 (단계별)
    required_documents = Column(Text)  # 제출서류
    notes = Column(Text)  # 유의사항
    application_method = Column(JSON)  # 접수방법 (사람인, 홈페이지, 우편 등)
    application_form = Column(String(100))  # 지원서 양식
    number_of_recruits = Column(Integer)  # 모집인원
    industry = Column(JSON)  # 업종 (여러 개)
    contact_person = Column(String(100))  # 담당자
    contact_department = Column(String(100))  # 부서명
    contact_phone = Column(String(20))  # 전화번호
    contact_mobile = Column(String(20))  # 휴대폰번호
    contact_email = Column(String(255))  # 이메일
    contact_private = Column(JSON)  # 비공개 설정 (담당자, 부서, 전화번호 등)
    
    # 관계
    applications = relationship("Application", back_populates="job_posting")
    
    def __repr__(self):
        return f"<JobPosting {self.id}: {self.title}>"


class Applicant(BaseModel):
    """지원자"""
    __tablename__ = "applicants"
    
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(20))
    
    # 이력서 정보 (파싱된 데이터)
    resume_data = Column(JSON)  # AI 파싱 결과
    resume_file_path = Column(String(500))
    cover_letter = Column(Text)
    
    # 경력 정보
    experience_years = Column(Integer)
    education = Column(JSON)
    skills = Column(JSON)
    certifications = Column(JSON)
    
    # AI 매칭 점수
    ai_match_score = Column(Float)
    ai_analysis = Column(JSON)
    
    # 관계
    applications = relationship("Application", back_populates="applicant")
    
    def __repr__(self):
        return f"<Applicant {self.id}: {self.name}>"


class Application(BaseModel):
    """지원서"""
    __tablename__ = "applications"
    
    job_posting_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    applicant_id = Column(Integer, ForeignKey("applicants.id"), nullable=False)
    
    status = Column(String(50), default=ApplicationStatus.APPLIED.value)
    applied_date = Column(Date, default=date.today)
    
    # 평가 정보
    screening_score = Column(Float)
    interview_scores = Column(JSON)
    evaluation_notes = Column(Text)
    
    # 일정 정보
    interview_scheduled_at = Column(Date)
    interview_completed_at = Column(Date)
    
    # 제안서
    offer_letter_path = Column(String(500))
    offer_accepted = Column(Boolean, default=False)
    offer_accepted_at = Column(Date)
    
    # 관계
    job_posting = relationship("JobPosting", back_populates="applications")
    applicant = relationship("Applicant", back_populates="applications")
    
    def __repr__(self):
        return f"<Application {self.id}: Job {self.job_posting_id} - Applicant {self.applicant_id}>"


# 지원서 양식 타입: 1~5 (첨부 PDF 양식 종류)
# 문서 언어: ko(한국어), en(영어), th(태국어)
class ParsedApplication(BaseModel):
    """이메일 접수 지원서 PDF 업로드 후 파싱 저장 테이블"""
    __tablename__ = "parsed_applications"
    
    # 업로드 파일 정보
    original_filename = Column(String(255), nullable=False)
    pdf_file_path = Column(String(500), nullable=False)
    
    # 지원서 종류(1~5) 및 작성 언어(ko/en/th)
    form_type = Column(Integer, default=1)  # 1~5
    document_language = Column(String(10), default="ko")  # ko, en, th
    
    # 파싱된 기본 정보
    applicant_name = Column(String(200))
    applicant_surname = Column(String(200))   # 성 (นามสกุล, Jobthai 등)
    applicant_email = Column(String(255))
    applicant_phone = Column(String(50))
    applicant_id = Column(String(100))        # 외부 지원자 ID (Jobthai รหัส 등)
    age = Column(String(20))                 # 나이 (อายุ, 25 ปี 등)
    application_date = Column(String(100))   # 지원날짜 (วันที่สมัคร, 28 ม.ค. 69 등)
    
    # 파싱된 항목별 필드 (jobbkk / JobThai / LinkedIn 3종 양식 공통)
    company_name = Column(String(300))       # 회사/기업명
    business_type = Column(String(200))     # 업종/사업유형
    applied_position = Column(String(300))   # 지원 직위 (สมัครตำแหน่ง, 지원한 직위)
    position = Column(String(200))           # 직위/직무 (현 직위 등)
    employment_period = Column(String(200))  # 근무기간
    salary = Column(String(100))             # 급여(원화/태국바트 등)
    address = Column(Text)                   # 주소
    education = Column(Text)                 # 학력
    experience = Column(Text)               # 경력
    skills = Column(Text)                    # 기술/스킬
    summary = Column(Text)                  # 요약/자기소개
    sections_intro = Column(Text)           # 인적사항 섹션
    sections_skills = Column(Text)          # 기술 섹션 상세
    sections_experience = Column(Text)      # 경력 섹션 전문
    sections_education = Column(Text)        # 학력 섹션 전문
    date_of_birth = Column(String(50))       # 생년월일 (วันเกิด)
    nationality = Column(String(100))        # 국적 (สัญชาติ)
    gender = Column(String(20))              # 성별 (เพศ)
    certification_license = Column(Text)     # 자격/면허 (ใบอนุญาต)
    linkedin_url = Column(String(500))      # LinkedIn URL
    update_date = Column(String(100))        # 갱신일 (อัปเดต)
    height_weight = Column(String(100))      # 신장/체중 (ส่วนสูง/น้ำหนัก) 통합
    height = Column(String(50))              # 신장 (ส่วนสูง) 단일
    weight = Column(String(50))              # 체중 (น้ำหนัก) 단일
    # PDF 추가 항목 (jobbkk/JobThai 상세)
    religion = Column(String(50))            # 종교 (ศาสนา)
    marital_status = Column(String(20))      # 혼인상태 (โสด/สมรส)
    desired_salary = Column(String(100))     # 희망급여 (เงินเดือนที่ต้องการ)
    military_status = Column(String(200))    # 병역 (สถานภาพทางทหาร)
    facebook_url = Column(String(500))       # Facebook URL
    line_id = Column(String(100))            # Line@ ID
    desired_work_locations = Column(Text)    # 희망근무지 (พื้นที่ที่ต้องการทำงาน)
    employment_type_preference = Column(String(100))  # 희망고용형태 (รูปแบบงาน)
    can_work_bangkok = Column(String(20))    # 방콕 근무가능 (ได้/ไม่)
    can_work_provinces = Column(String(20))  # 지방 근무가능
    willing_work_abroad = Column(String(20)) # 해외근무희망
    occupation_field = Column(String(200))   # 직종 (สาขาอาชีพ)
    sub_occupation = Column(String(200))     # 세부직종 (สาขาอาชีพย่อย)
    vehicles_owned = Column(Text)             # 보유차량 (ยานพาหนะที่มี)
    driving_license = Column(Text)            # 운전면허 (ใบขับขี่)
    driving_ability = Column(Text)            # 운전능력 (ความสามารถในการขับขี่)
    language_skills = Column(Text)            # 언어능력 (ทักษะทางภาษา)
    training_info = Column(Text)              # 교육훈련 (ข้อมูลการฝึกอบรม)
    # 양식2(Jobthai) 추가 항목
    start_date_available = Column(String(200))  # 근무 시작 가능일 (วันที่สามารถเริ่มงานได้)
    desired_positions = Column(Text)            # 희망 직위 목록 (ตำแหน่งงานที่ต้องการสมัคร)
    education_level = Column(String(100))      # 학력 수준 (ระดับการศึกษา, ปวส. 등)
    faculty = Column(String(200))             # 단과대학/학과 (คณะ)
    major = Column(String(200))                # 전공 (สาขา)
    qualification = Column(String(200))       # 자격/학위 (วุฒิ)
    gpa = Column(String(20))                  # 평점/ GPA (เกรดเฉลี่ย)
    other_notes = Column(Text)                 # 비고 (ไม่สนใจงานขายประกัน 등)
    # 최근 경력 3건 (지원서 목록 테이블용)
    last_working_1 = Column(String(300))      # Last Working 1 (회사/직위 등)
    lw1_period = Column(String(100))         # LW1 period (근무기간)
    last_working_2 = Column(String(300))
    lw2_period = Column(String(100))
    last_working_3 = Column(String(300))
    lw3_period = Column(String(100))
    
    # 파싱된 상세 정보 (JSON, 원본 구조 보존)
    parsed_data = Column(JSON)  # education, experience, skills, summary, sections_preview 등
    
    # 원문 텍스트 (검색/재파싱용)
    raw_text = Column(Text)
    
    # 추후 채용공고 연결용
    job_posting_id = Column(Integer, ForeignKey("job_postings.id"), nullable=True)
    job_posting = relationship("JobPosting", foreign_keys=[job_posting_id])
    
    # 상태: parsed(파싱완료), linked(공고연결됨), rejected 등
    status = Column(String(50), default="parsed")

    # 등록자 (업로드한 사용자)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    creator = relationship("User", foreign_keys=[created_by_id])
    
    def __repr__(self):
        return f"<ParsedApplication {self.id}: {self.original_filename}>"
