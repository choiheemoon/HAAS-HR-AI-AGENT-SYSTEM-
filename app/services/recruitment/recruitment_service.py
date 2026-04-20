"""채용 서비스"""
import os
import re
import uuid
import secrets
from pathlib import Path
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, datetime
from app.models.recruitment import JobPosting, Applicant, Application, ParsedApplication, JobStatus, ApplicationStatus
from app.core.ai_agent import RecruitmentAgent, HRAIAgent
from app.services.recruitment.resume_parser import ResumeParser
from app.services.recruitment.ai_sourcing import AISourcing
from app.config import settings


# 지원번호 채번 규칙: RM-YYYYMMDD-NNNN (예: RM-20250219-0001)
REF_CODE_PATTERN = re.compile(r"^RM-\d{8}-\d{4}$")


def is_valid_ref_code(value: Optional[str]) -> bool:
    """지원번호가 채번 규칙에 맞는지 검사."""
    if not value or not isinstance(value, str):
        return False
    return bool(REF_CODE_PATTERN.match(value.strip()))


class RecruitmentService:
    """채용 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
        self.base_agent = HRAIAgent(db=db)
        self.recruitment_agent = RecruitmentAgent(self.base_agent)
        self.resume_parser = ResumeParser()
        self.ai_sourcing = AISourcing(db=db)
    
    def get_job_postings(self, status: Optional[str] = None) -> List[JobPosting]:
        """채용 공고 목록 조회"""
        query = self.db.query(JobPosting)
        if status:
            query = query.filter(JobPosting.status == status)
        return query.order_by(JobPosting.created_at.desc()).all()
    
    def get_job_posting(self, job_posting_id: int) -> Optional[JobPosting]:
        """채용 공고 상세 조회"""
        return self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
    
    def update_job_posting(self, job_posting_id: int, job_data: Dict[str, Any]) -> Optional[JobPosting]:
        """채용 공고 수정"""
        import logging
        logger = logging.getLogger(__name__)
        
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            return None
        
        # DRAFT 상태가 아니면 수정 불가 (이전 로직 제거 - 모든 상태에서 수정 가능하도록)
        # if job_posting.status != JobStatus.DRAFT.value:
        #     raise ValueError(f"초안 상태의 공고만 수정할 수 있습니다. 현재 상태: {job_posting.status}")
        
        # 디버깅: 받은 데이터 로깅
        logger.info(f"[채용 공고 수정] 공고 ID: {job_posting_id}")
        logger.info(f"[채용 공고 수정] 받은 데이터: {job_data}")
        
        updated_fields = []
        skipped_fields = []
        
        for key, value in job_data.items():
            if hasattr(job_posting, key):
                old_value = getattr(job_posting, key, None)
                setattr(job_posting, key, value)
                updated_fields.append(f"{key}: {old_value} -> {value}")
            else:
                skipped_fields.append(key)
        
        if skipped_fields:
            logger.warning(f"[채용 공고 수정] 모델에 없는 필드 (업데이트되지 않음): {skipped_fields}")
        
        logger.info(f"[채용 공고 수정] 업데이트된 필드: {updated_fields}")
        
        self.db.commit()
        self.db.refresh(job_posting)
        
        # 저장 후 실제 저장된 데이터 확인
        logger.info(f"[채용 공고 수정] 저장된 경력: {job_posting.experience_type}")
        logger.info(f"[채용 공고 수정] 저장된 학력: {job_posting.education}")
        logger.info(f"[채용 공고 수정] 저장된 접수 시작일: {job_posting.application_start_date}")
        logger.info(f"[채용 공고 수정] 저장된 접수 종료일: {job_posting.application_end_date}")
        logger.info(f"[채용 공고 수정] 저장된 담당자: {job_posting.contact_person}")
        
        return job_posting
    
    def delete_job_posting(self, job_posting_id: int) -> bool:
        """채용 공고 삭제"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            return False
        
        # DRAFT 또는 PENDING_APPROVAL 상태만 삭제 가능
        if job_posting.status not in [JobStatus.DRAFT.value, JobStatus.PENDING_APPROVAL.value]:
            raise ValueError(f"초안 또는 승인 대기 상태의 공고만 삭제할 수 있습니다. 현재 상태: {job_posting.status}")
        
        self.db.delete(job_posting)
        self.db.commit()
        return True
    
    def create_job_posting(self, job_data: Dict[str, Any]) -> JobPosting:
        """채용 공고 생성"""
        # AI 생성은 비동기로 처리하거나 선택적으로 사용
        # 성능 향상을 위해 AI 생성은 제거하고 직접 저장
        # 필요시 나중에 백그라운드 작업으로 처리 가능
        
        # 디버깅: 받은 데이터 로깅
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[채용 공고 생성] 받은 데이터: {job_data}")
        
        # 기본 상태 설정
        if "status" not in job_data:
            from app.models.recruitment import JobStatus
            job_data["status"] = JobStatus.DRAFT.value
        
        # JobPosting 모델 인스턴스 생성
        from app.models.recruitment import JobPosting
        
        # 직접 필드 설정 (None 값도 포함하여 명시적으로 설정)
        job_posting = JobPosting()
        job_posting.status = job_data.get("status", JobStatus.DRAFT.value)
        
        # 모든 필드를 명시적으로 설정 (None 값도 포함)
        for key, value in job_data.items():
            if hasattr(job_posting, key):
                # None 값도 명시적으로 설정
                setattr(job_posting, key, value)
                logger.info(f"[채용 공고 생성] 필드 설정: {key} = {value}")
            else:
                logger.warning(f"[채용 공고 생성] 모델에 없는 필드 무시: {key}")
        
        # 필터링된 데이터 로깅
        logger.info(f"[채용 공고 생성] 설정된 경력: {job_posting.experience_type}")
        logger.info(f"[채용 공고 생성] 설정된 학력: {job_posting.education}")
        logger.info(f"[채용 공고 생성] 설정된 직무: {job_posting.job_role}")
        logger.info(f"[채용 공고 생성] 설정된 모집분야명: {job_posting.recruitment_fields}")
        
        self.db.add(job_posting)
        self.db.commit()
        self.db.refresh(job_posting)
        
        # 저장 후 실제 저장된 데이터 확인
        logger.info(f"[채용 공고 생성] 저장된 공고 ID: {job_posting.id}")
        logger.info(f"[채용 공고 생성] 저장된 경력: {job_posting.experience_type}")
        logger.info(f"[채용 공고 생성] 저장된 학력: {job_posting.education}")
        logger.info(f"[채용 공고 생성] 저장된 직무: {job_posting.job_role}")
        logger.info(f"[채용 공고 생성] 저장된 모집분야명: {job_posting.recruitment_fields}")
        logger.info(f"[채용 공고 생성] 저장된 접수 시작일: {job_posting.application_start_date}")
        logger.info(f"[채용 공고 생성] 저장된 접수 종료일: {job_posting.application_end_date}")
        logger.info(f"[채용 공고 생성] 저장된 담당자: {job_posting.contact_person}")
        logger.info(f"[채용 공고 생성] 저장된 담당자 부서: {job_posting.contact_department}")
        logger.info(f"[채용 공고 생성] 저장된 담당자 전화: {job_posting.contact_phone}")
        logger.info(f"[채용 공고 생성] 저장된 담당자 이메일: {job_posting.contact_email}")
        
        return job_posting
    
    def request_approval(self, job_posting_id: int) -> JobPosting:
        """채용 공고 승인 요청 (DRAFT → PENDING_APPROVAL)"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            raise ValueError("채용 공고를 찾을 수 없습니다.")
        
        if job_posting.status != JobStatus.DRAFT.value:
            raise ValueError(f"승인 요청은 초안 상태에서만 가능합니다. 현재 상태: {job_posting.status}")
        
        job_posting.status = JobStatus.PENDING_APPROVAL.value
        self.db.commit()
        self.db.refresh(job_posting)
        return job_posting
    
    def cancel_approval_request(self, job_posting_id: int) -> JobPosting:
        """채용 공고 승인 요청 취소 (PENDING_APPROVAL → DRAFT)"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            raise ValueError("채용 공고를 찾을 수 없습니다.")
        
        if job_posting.status != JobStatus.PENDING_APPROVAL.value:
            raise ValueError(f"승인 취소는 승인 대기 상태에서만 가능합니다. 현재 상태: {job_posting.status}")
        
        job_posting.status = JobStatus.DRAFT.value
        self.db.commit()
        self.db.refresh(job_posting)
        return job_posting
    
    def approve_job_posting(self, job_posting_id: int, approver_id: int) -> JobPosting:
        """채용 공고 승인 (PENDING_APPROVAL → APPROVED)"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            raise ValueError("채용 공고를 찾을 수 없습니다.")
        
        if job_posting.status != JobStatus.PENDING_APPROVAL.value:
            raise ValueError(f"승인은 승인 대기 상태에서만 가능합니다. 현재 상태: {job_posting.status}")
        
        job_posting.status = JobStatus.APPROVED.value
        self.db.commit()
        self.db.refresh(job_posting)
        return job_posting
    
    def publish_job_posting(self, job_posting_id: int, job_sites: List[str]) -> JobPosting:
        """채용 공고 배포 (APPROVED 상태만 배포 가능)"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            raise ValueError("채용 공고를 찾을 수 없습니다.")
        
        # 승인된 공고만 배포 가능
        if job_posting.status != JobStatus.APPROVED.value:
            raise ValueError(f"배포는 승인된 공고만 가능합니다. 현재 상태: {job_posting.status}")
        
        job_posting.status = JobStatus.PUBLISHED.value
        job_posting.posted_date = date.today()
        job_posting.job_sites = job_sites or []

        # 배포 대상 사이트 로깅 (실제 외부 API 연동 시 _publish_to_job_sites 구현)
        import logging
        logging.getLogger(__name__).info(
            "채용 공고 배포: id=%s, title=%s, job_sites=%s",
            job_posting.id,
            getattr(job_posting, "title", None) or getattr(job_posting, "recruitment_fields", None),
            job_posting.job_sites,
        )

        self.db.commit()
        self.db.refresh(job_posting)
        return job_posting

    def generate_public_slug(self, job_posting_id: int) -> Tuple[Optional[JobPosting], Optional[str]]:
        """채용 공고에 공개 URL용 slug 생성. (job_posting, public_slug) 반환. 이미 있으면 기존 slug 반환."""
        from sqlalchemy.exc import OperationalError, ProgrammingError
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            return None, None
        if getattr(job_posting, "public_slug", None):
            return job_posting, job_posting.public_slug
        for _ in range(10):
            slug = secrets.token_hex(6).lower()  # 12자 영숫자
            exists = self.db.query(JobPosting).filter(JobPosting.public_slug == slug).first()
            if not exists:
                try:
                    job_posting.public_slug = slug
                    self.db.commit()
                    self.db.refresh(job_posting)
                    return job_posting, slug
                except (OperationalError, ProgrammingError) as e:
                    self.db.rollback()
                    err = str(e).lower()
                    if "public_slug" in err or "column" in err:
                        raise ValueError(
                            "public_slug 컬럼이 없습니다. add_public_slug.sql 을 실행한 뒤 서버를 재시작하세요."
                        ) from e
                    raise
        return None, None

    def get_job_posting_by_public_slug(self, slug: str) -> Optional[JobPosting]:
        """공개 slug로 채용 공고 조회 (로그인 불필요, published/approved만 노출 권장)."""
        return (
            self.db.query(JobPosting)
            .filter(JobPosting.public_slug == slug)
            .first()
        )

    def parse_resume(self, resume_file_path: str) -> Dict[str, Any]:
        """이력서 파싱"""
        # 파일에서 텍스트 추출
        resume_text = self.resume_parser.extract_text(resume_file_path)
        
        # AI를 사용하여 구조화된 데이터로 변환
        parsed_data = self.recruitment_agent.parse_resume(resume_text, resume_file_path)
        
        return parsed_data
    
    def create_application(self, job_posting_id: int, applicant_data: Dict[str, Any], resume_file_path: Optional[str] = None) -> Application:
        """지원서 생성"""
        # 지원자 정보 저장
        applicant = Applicant(**applicant_data)
        
        # 이력서 파싱
        if resume_file_path:
            parsed_resume = self.parse_resume(resume_file_path)
            applicant.resume_data = parsed_resume
            applicant.resume_file_path = resume_file_path
        
        self.db.add(applicant)
        self.db.flush()
        
        # 지원서 생성
        application = Application(
            job_posting_id=job_posting_id,
            applicant_id=applicant.id,
            status=ApplicationStatus.APPLIED.value
        )
        self.db.add(application)
        self.db.commit()
        self.db.refresh(application)
        
        # AI 매칭 점수 계산
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if job_posting:
            match_result = self.recruitment_agent.match_candidate(
                applicant.resume_data or {},
                job_posting.description or ""
            )
            applicant.ai_match_score = match_result.get("score", 0)
            applicant.ai_analysis = match_result
            self.db.commit()
        
        return application
    
    def search_candidates(self, job_posting_id: int, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        """AI 소싱을 통한 후보자 검색"""
        job_posting = self.db.query(JobPosting).filter(JobPosting.id == job_posting_id).first()
        if not job_posting:
            raise ValueError("채용 공고를 찾을 수 없습니다.")
        
        # AI 소싱 실행
        candidates = self.ai_sourcing.search(
            job_description=job_posting.description,
            requirements=criteria
        )
        
        return candidates
    
    def evaluate_application(self, application_id: int, evaluation_data: Dict[str, Any]) -> Application:
        """지원서 평가"""
        application = self.db.query(Application).filter(Application.id == application_id).first()
        if not application:
            raise ValueError("지원서를 찾을 수 없습니다.")
        
        application.screening_score = evaluation_data.get("score")
        application.evaluation_notes = evaluation_data.get("notes")
        application.status = evaluation_data.get("status", application.status)
        
        self.db.commit()
        self.db.refresh(application)
        return application
    
    def generate_offer_letter(self, application_id: int, offer_data: Dict[str, Any]) -> str:
        """제안서 생성"""
        application = self.db.query(Application).filter(Application.id == application_id).first()
        if not application:
            raise ValueError("지원서를 찾을 수 없습니다.")
        
        # 제안서 템플릿 생성 (실제로는 템플릿 엔진 사용)
        offer_letter = f"""
        제안서
        
        {application.applicant.name}님께,
        
        {offer_data.get('position')} 포지션에 대한 제안서입니다.
        
        급여: {offer_data.get('salary')}
        시작일: {offer_data.get('start_date')}
        
        감사합니다.
        """
        
        # 파일로 저장
        # offer_letter_path = self._save_offer_letter(application_id, offer_letter)
        # application.offer_letter_path = offer_letter_path
        # self.db.commit()
        
        return offer_letter
    
    def get_applications(self, job_posting_id: Optional[int] = None, status: Optional[str] = None) -> List[Application]:
        """지원서 목록 조회"""
        query = self.db.query(Application)
        
        if job_posting_id:
            query = query.filter(Application.job_posting_id == job_posting_id)
        
        if status:
            query = query.filter(Application.status == status)
        
        return query.all()

    def save_resume_file(self, file, job_posting_id: Optional[int] = None) -> str:
        """업로드된 이력서 파일을 저장하고 경로 반환"""
        base_dir = Path(settings.STORAGE_PATH or "./storage")
        resumes_dir = base_dir / "resumes"
        if job_posting_id:
            resumes_dir = resumes_dir / str(job_posting_id)
        resumes_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename or "pdf").suffix or ".pdf"
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = resumes_dir / unique_name
        with open(file_path, "wb") as f:
            content = file.file.read()
            f.write(content)
        return str(file_path)

    # ----- 지원서 접수 및 파싱 (이메일 접수 PDF 업로드 → 파싱 → parsed_applications 테이블 저장) -----

    FORM_TYPE_WEB = 6  # 웹지원 (입사정보 등록 지원하기)

    def create_parsed_application_from_web(
        self,
        job_posting_id: int,
        data: Dict[str, Any],
    ) -> ParsedApplication:
        """웹 입사정보 등록 지원 → parsed_applications에 저장 (form_type=6, 웹지원)"""
        base_dir = Path(settings.STORAGE_PATH or "./storage")
        web_dir = base_dir / "web_input"
        web_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f"web_{uuid.uuid4().hex}.txt"
        file_path = web_dir / unique_name
        file_path.write_text("웹지원 입사정보 등록\n", encoding="utf-8")
        stored_path = f"web_input/{unique_name}"

        def _s(v: Any, max_len: int = 50000) -> Optional[str]:
            if v is None or v == "":
                return None
            s = str(v).replace("\x00", "").replace("\u0000", "")[:max_len]
            return s if s else None

        def _t(v: Any) -> Optional[str]:
            return _s(v, 50000)

        # 지원번호: 채번 규칙(RM-YYYYMMDD-NNNN)에 맞지 않으면 자동 채번
        applicant_id_raw = _s(data.get("applicant_id"), 100)
        ref_code = self._generate_ref_code()
        applicant_id = ref_code if not applicant_id_raw or not is_valid_ref_code(applicant_id_raw) else applicant_id_raw

        record = ParsedApplication(
            original_filename="웹지원_입사정보등록",
            pdf_file_path=stored_path,
            form_type=self.FORM_TYPE_WEB,
            document_language=_s(data.get("document_language"), 10) or "ko",
            job_posting_id=job_posting_id,
            applicant_name=_s(data.get("applicant_name"), 200),
            applicant_surname=_s(data.get("applicant_surname"), 200),
            applicant_email=_s(data.get("applicant_email"), 255),
            applicant_phone=_s(data.get("applicant_phone"), 50),
            applicant_id=applicant_id,
            age=_s(data.get("age"), 20),
            address=_t(data.get("address")),
            applied_position=_s(data.get("applied_position"), 300),
            date_of_birth=_s(data.get("date_of_birth"), 50),
            education=_t(data.get("education")),
            experience=_t(data.get("experience")),
            skills=_t(data.get("skills")),
            summary=_t(data.get("summary")),
            gender=_s(data.get("gender"), 20),
            nationality=_s(data.get("nationality"), 100),
            desired_salary=_s(data.get("desired_salary"), 100),
            desired_positions=_t(data.get("desired_positions")),
            start_date_available=_s(data.get("start_date_available"), 200),
            other_notes=_t(data.get("other_notes")),
            parsed_data={"source": "web", "form_type": 6},
            raw_text=_t(data.get("summary")) or "",
            status="parsed",
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_parsed_applications(
        self,
        form_type: Optional[int] = None,
        document_language: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
        skip: int = 0,
    ) -> tuple[List[ParsedApplication], int]:
        """파싱된 지원서 목록 조회 (채용공고 제목용 job_posting 조인). (items, total) 반환. total은 limit와 무관하게 전체 조건 부합 건수."""
        from sqlalchemy import func
        from sqlalchemy.orm import joinedload
        base = self.db.query(ParsedApplication)
        if form_type is not None:
            base = base.filter(ParsedApplication.form_type == form_type)
        if document_language:
            base = base.filter(ParsedApplication.document_language == document_language)
        if status:
            base = base.filter(ParsedApplication.status == status)
        # 전체 건수: limit/offset 없이 별도 count 쿼리로 확실히 반환
        total = self.db.query(func.count(ParsedApplication.id)).select_from(ParsedApplication)
        if form_type is not None:
            total = total.filter(ParsedApplication.form_type == form_type)
        if document_language:
            total = total.filter(ParsedApplication.document_language == document_language)
        if status:
            total = total.filter(ParsedApplication.status == status)
        total = total.scalar() or 0
        items = (
            base.options(
                joinedload(ParsedApplication.job_posting),
                joinedload(ParsedApplication.creator),
            )
            .order_by(ParsedApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return items, total

    def get_parsed_application(self, parsed_application_id: int) -> Optional[ParsedApplication]:
        """파싱된 지원서 상세 조회 (채용공고 제목용 job_posting 조인)"""
        from sqlalchemy.orm import joinedload
        return (
            self.db.query(ParsedApplication)
            .options(
                joinedload(ParsedApplication.job_posting),
                joinedload(ParsedApplication.creator),
            )
            .filter(ParsedApplication.id == parsed_application_id)
            .first()
        )

    def delete_parsed_applications(self, ids: List[int]) -> int:
        """파싱된 지원서 삭제 (id 목록). 삭제된 건수 반환."""
        if not ids:
            return 0
        # 정수만 사용 (문자열 등 혼입 방지)
        id_list = [int(x) for x in ids if x is not None]
        if not id_list:
            return 0
        deleted = 0
        for pid in id_list:
            try:
                n = self.db.query(ParsedApplication).filter(ParsedApplication.id == pid).delete(synchronize_session=False)
                deleted += n
            except Exception:
                self.db.rollback()
                raise
        self.db.commit()
        return deleted

    def _generate_ref_code(self) -> str:
        """Ref code 자동 채번: RM-년도(4자리)+월(2자리)+일(2자리)+-순번(4자리). 당일 기준 순번 부여."""
        now = datetime.now()
        date_str = now.strftime("%Y%m%d")
        prefix = f"RM-{date_str}-"
        rows = (
            self.db.query(ParsedApplication.applicant_id)
            .filter(ParsedApplication.applicant_id.like(f"{prefix}%"))
            .all()
        )
        max_seq = 0
        for (aid,) in rows:
            if not aid or not aid.startswith(prefix):
                continue
            try:
                suffix = aid[len(prefix) :].strip()
                if suffix.isdigit():
                    max_seq = max(max_seq, int(suffix))
            except (ValueError, IndexError):
                continue
        next_seq = max_seq + 1
        return f"{prefix}{next_seq:04d}"

    def upload_and_parse_application(
        self,
        file,
        form_type_hint: Optional[int] = None,
        language_hint: Optional[str] = None,
        job_posting_id: Optional[int] = None,
        created_by_id: Optional[int] = None,
    ) -> ParsedApplication:
        """PDF 업로드 후 파싱하여 parsed_applications 테이블에 저장"""
        import re
        base_dir = Path(settings.STORAGE_PATH or "./storage")
        upload_dir = base_dir / "parsed_applications"
        upload_dir.mkdir(parents=True, exist_ok=True)
        original_filename = (file.filename or "resume.pdf").strip()
        if not original_filename.lower().endswith(".pdf"):
            raise ValueError("지원서는 PDF 파일만 업로드 가능합니다.")
        safe_name = re.sub(r'[<>:"/\\|?*]', "_", original_filename)
        unique_name = f"{uuid.uuid4().hex}_{safe_name}"
        file_path = upload_dir / unique_name
        content = file.file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        # DB에는 기준 디렉터리 대비 상대 경로 저장 (열람 시 경로 해석 통일)
        stored_path = f"parsed_applications/{unique_name}"

        parsed_result = self.resume_parser.parse_pdf_to_structured_data(
            str(file_path),
            form_type_hint=form_type_hint,
            language_hint=language_hint,
            original_filename=original_filename,
        )

        # Ref code 자동 채번: RM-YYYYMMDD-NNNN (지원서 접수 시점 기준). 저장 시 항상 채번값 사용.
        ref_code = self._generate_ref_code()
        parsed_result["applicant_id"] = ref_code

        def strip_nul(s: Optional[str]) -> Optional[str]:
            """PostgreSQL does not allow NUL (0x00) in string literals."""
            if s is None:
                return None
            if isinstance(s, str):
                return s.replace("\x00", "").replace("\u0000", "")
            return s

        def norm_date_str(s: Optional[str], max_len: int = 100) -> Optional[str]:
            """날짜 문자열에서 줄바꿈 제거 후 반환."""
            s = strip_nul(s)
            if not s or not isinstance(s, str):
                return None
            t = re.sub(r"[\r\n]+", " ", s).strip()
            return t[:max_len] if t else None

        def strip_nul_in_dict(obj: Any) -> Any:
            if obj is None:
                return None
            if isinstance(obj, str):
                return strip_nul(obj)
            if isinstance(obj, dict):
                return {k: strip_nul_in_dict(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [strip_nul_in_dict(v) for v in obj]
            return obj

        raw_text = strip_nul((parsed_result.get("raw_text") or "")[:50000])
        parsed_data = strip_nul_in_dict(parsed_result.get("parsed_data"))
        _t = lambda x: strip_nul((x or "")[:50000]) if x else None  # Text 필드 최대 50000자

        record = ParsedApplication(
            original_filename=strip_nul(original_filename) or original_filename,
            pdf_file_path=stored_path,
            form_type=parsed_result.get("form_type", 1),
            document_language=strip_nul(parsed_result.get("document_language")) or "en",
            job_posting_id=job_posting_id,
            created_by_id=created_by_id,
            applicant_name=strip_nul(parsed_result.get("applicant_name")),
            applicant_surname=strip_nul((parsed_result.get("applicant_surname") or "")[:200]) or None,
            applicant_email=strip_nul(parsed_result.get("applicant_email")),
            applicant_phone=strip_nul(parsed_result.get("applicant_phone")),
            applicant_id=ref_code,
            age=strip_nul((parsed_result.get("age") or "")[:20]) or None,
            application_date=norm_date_str(parsed_result.get("application_date"), 100),
            company_name=strip_nul((parsed_result.get("company_name") or "")[:300]) or None,
            business_type=strip_nul((parsed_result.get("business_type") or "")[:200]) or None,
            applied_position=strip_nul((parsed_result.get("applied_position") or "")[:300]) or None,
            position=strip_nul((parsed_result.get("position") or "")[:200]) or None,
            employment_period=strip_nul((parsed_result.get("employment_period") or "")[:200]) or None,
            salary=strip_nul((parsed_result.get("salary") or "")[:100]) or None,
            address=_t(parsed_result.get("address")),
            education=_t(parsed_result.get("education")),
            experience=_t(parsed_result.get("experience")),
            skills=_t(parsed_result.get("skills")),
            summary=_t(parsed_result.get("summary")),
            sections_intro=_t(parsed_result.get("sections_intro")),
            sections_skills=_t(parsed_result.get("sections_skills")),
            sections_experience=_t(parsed_result.get("sections_experience")),
            sections_education=_t(parsed_result.get("sections_education")),
            date_of_birth=norm_date_str(parsed_result.get("date_of_birth"), 50),
            nationality=strip_nul((parsed_result.get("nationality") or "")[:100]) or None,
            gender=strip_nul((parsed_result.get("gender") or "")[:20]) or None,
            certification_license=_t(parsed_result.get("certification_license")),
            linkedin_url=strip_nul((parsed_result.get("linkedin_url") or "")[:500]) or None,
            update_date=norm_date_str(parsed_result.get("update_date"), 100),
            height_weight=strip_nul((parsed_result.get("height_weight") or "")[:100]) or None,
            height=strip_nul((parsed_result.get("height") or "")[:50]) or None,
            weight=strip_nul((parsed_result.get("weight") or "")[:50]) or None,
            religion=strip_nul((parsed_result.get("religion") or "")[:50]) or None,
            marital_status=strip_nul((parsed_result.get("marital_status") or "")[:20]) or None,
            desired_salary=strip_nul((parsed_result.get("desired_salary") or "")[:100]) or None,
            military_status=strip_nul((parsed_result.get("military_status") or "")[:200]) or None,
            facebook_url=strip_nul((parsed_result.get("facebook_url") or "")[:500]) or None,
            line_id=strip_nul((parsed_result.get("line_id") or "")[:100]) or None,
            desired_work_locations=_t(parsed_result.get("desired_work_locations")),
            employment_type_preference=strip_nul((parsed_result.get("employment_type_preference") or "")[:100]) or None,
            can_work_bangkok=strip_nul((parsed_result.get("can_work_bangkok") or "")[:20]) or None,
            can_work_provinces=strip_nul((parsed_result.get("can_work_provinces") or "")[:20]) or None,
            willing_work_abroad=strip_nul((parsed_result.get("willing_work_abroad") or "")[:20]) or None,
            occupation_field=strip_nul((parsed_result.get("occupation_field") or "")[:200]) or None,
            sub_occupation=strip_nul((parsed_result.get("sub_occupation") or "")[:200]) or None,
            vehicles_owned=_t(parsed_result.get("vehicles_owned")),
            driving_license=_t(parsed_result.get("driving_license")),
            driving_ability=_t(parsed_result.get("driving_ability")),
            language_skills=_t(parsed_result.get("language_skills")),
            training_info=_t(parsed_result.get("training_info")),
            start_date_available=norm_date_str(parsed_result.get("start_date_available"), 200),
            desired_positions=_t(parsed_result.get("desired_positions")),
            education_level=strip_nul((parsed_result.get("education_level") or "")[:100]) or None,
            faculty=strip_nul((parsed_result.get("faculty") or "")[:200]) or None,
            major=strip_nul((parsed_result.get("major") or "")[:200]) or None,
            qualification=strip_nul((parsed_result.get("qualification") or "")[:200]) or None,
            gpa=strip_nul((parsed_result.get("gpa") or "")[:20]) or None,
            other_notes=_t(parsed_result.get("other_notes")),
            last_working_1=strip_nul((parsed_result.get("last_working_1") or "")[:300]) or None,
            lw1_period=strip_nul((parsed_result.get("lw1_period") or "")[:100]) or None,
            last_working_2=strip_nul((parsed_result.get("last_working_2") or "")[:300]) or None,
            lw2_period=strip_nul((parsed_result.get("lw2_period") or "")[:100]) or None,
            last_working_3=strip_nul((parsed_result.get("last_working_3") or "")[:300]) or None,
            lw3_period=strip_nul((parsed_result.get("lw3_period") or "")[:100]) or None,
            parsed_data=parsed_data,
            raw_text=raw_text,
            status="parsed",
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record
