"""직원 모델"""
from sqlalchemy import Column, String, Date, Integer, Float, Boolean, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import date


class Employee(BaseModel):
    """직원 정보"""
    __tablename__ = "employees"

    # 회사별 사번 중복 방지(회사/사번 조합은 유니크)
    __table_args__ = (
        UniqueConstraint("company_id", "employee_number", name="uq_employees_company_employee_number"),
    )
    
    # 기본 정보
    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    employee_number = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    name_en = Column(String(100))
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20))
    
    # 인사 정보
    department = Column(String(100))
    position = Column(String(100))
    job_level = Column(String(50))
    hire_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    employment_type = Column(String(50))  # 정규직, 계약직, 파트타임 등
    # 급여처리유형(인사기준정보 category=employee_type 코드; 월급직 등)
    salary_process_type = Column(String(50), nullable=True)
    # 조직·근무 확장(기존 localStorage 전용 → DB 동기화, 인사기준정보 코드)
    division = Column(String(100), nullable=True)
    work_place = Column(String(100), nullable=True)
    area = Column(String(100), nullable=True)
    work_status = Column(String(100), nullable=True)
    employee_level = Column(String(100), nullable=True)
    status = Column(String(50), default="active")  # active, inactive, terminated

    # 인사기준정보(employee_reference_items)와의 FK — 코드 문자열과 병행, 저장 시 서비스에서 동기화
    department_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    job_level_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    position_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    employment_type_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    salary_process_type_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    division_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    work_place_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    area_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    work_status_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    employee_level_item_id = Column(
        Integer,
        ForeignKey("employee_reference_items.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    
    # 급여 정보
    base_salary = Column(Float)
    currency = Column(String(10), default="KRW")
    bank_name = Column(String(100))
    bank_account = Column(String(100))
    
    # 개인 정보
    resident_number = Column(String(50))  # 암호화 필요
    address = Column(Text)
    birth_date = Column(Date)
    gender = Column(String(10))
    
    # 세금 정보
    tax_id = Column(String(50))
    dependents = Column(Integer, default=0)
    tax_exemptions = Column(JSON)  # 세금 공제 항목
    
    # 추가 정보
    qualifications = Column(JSON)  # 자격증, 학력 등
    emergency_contact = Column(JSON)
    notes = Column(Text)
    # 증명사진 본편 JPEG (STORAGE_PATH 기준, 예: employee_photos/COMP001/12.jpg; 썸네일은 …/thumbnails/12.jpg)
    photo_path = Column(String(512), nullable=True)
    # 출입(스와이프) 카드 번호 — 인사 기본정보와 동기
    swipe_card = Column(String(100), nullable=True)
    # 학력 탭 하단(직원 단위)
    education_activity_study = Column(Text, nullable=True)
    education_certificate = Column(Text, nullable=True)
    
    # 사용자 계정 연결
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True)
    
    # 관계
    attendances = relationship("Attendance", back_populates="employee", foreign_keys="Attendance.employee_id")
    leaves = relationship("Leave", back_populates="employee", foreign_keys="Leave.employee_id")
    payrolls = relationship("Payroll", back_populates="employee", foreign_keys="Payroll.employee_id")
    documents = relationship("Document", back_populates="employee", foreign_keys="Document.employee_id")
    educations = relationship(
        "EmployeeEducation",
        back_populates="employee",
        order_by="EmployeeEducation.sort_order",
        cascade="all, delete-orphan",
    )
    families = relationship(
        "EmployeeFamily",
        back_populates="employee",
        order_by="EmployeeFamily.sort_order",
        cascade="all, delete-orphan",
    )
    careers = relationship(
        "EmployeeCareer",
        back_populates="employee",
        order_by="EmployeeCareer.sort_order",
        cascade="all, delete-orphan",
    )
    personal_info = relationship(
        "EmployeePersonalInfo",
        back_populates="employee",
        uselist=False,
        cascade="all, delete-orphan",
    )
    certifications = relationship(
        "EmployeeCertification",
        back_populates="employee",
        order_by="EmployeeCertification.sort_order",
        cascade="all, delete-orphan",
    )
    languages = relationship(
        "EmployeeLanguage",
        back_populates="employee",
        order_by="EmployeeLanguage.sort_order",
        cascade="all, delete-orphan",
    )
    certificate_issues = relationship(
        "EmployeeCertificateIssue",
        cascade="all, delete-orphan",
        order_by="EmployeeCertificateIssue.id.desc()",
    )
    address_record = relationship(
        "EmployeeAddress",
        back_populates="employee",
        uselist=False,
        cascade="all, delete-orphan",
    )
    foreigner_info = relationship(
        "EmployeeForeignerInfo",
        back_populates="employee",
        uselist=False,
        cascade="all, delete-orphan",
    )
    user = relationship("User", back_populates="employee")
    company = relationship("Company")
    department_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[department_item_id],
    )
    job_level_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[job_level_item_id],
    )
    position_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[position_item_id],
    )
    employment_type_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[employment_type_item_id],
    )
    salary_process_type_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[salary_process_type_item_id],
    )
    division_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[division_item_id],
    )
    work_place_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[work_place_item_id],
    )
    area_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[area_item_id],
    )
    work_status_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[work_status_item_id],
    )
    employee_level_ref = relationship(
        "EmployeeReferenceItem",
        foreign_keys=[employee_level_item_id],
    )

    def __repr__(self):
        return f"<Employee {self.employee_number}: {self.name}>"
