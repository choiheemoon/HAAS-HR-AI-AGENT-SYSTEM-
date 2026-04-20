"""직원 스키마"""
from pydantic import BaseModel, EmailStr, ConfigDict, model_validator
from typing import Optional, Dict, Any
from datetime import date

from app.utils.encryption import decrypt_sensitive_data
from app.utils.validators import mask_resident_number_for_display


class EmployeeBase(BaseModel):
    """직원 기본 스키마"""
    company_id: Optional[int] = None
    employee_number: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    hire_date: date


class EmployeeCreate(EmployeeBase):
    """직원 생성 스키마"""
    model_config = ConfigDict(extra="ignore")

    base_salary: Optional[float] = None
    currency: str = "KRW"
    name_en: Optional[str] = None
    job_level: Optional[str] = None
    employment_type: Optional[str] = None
    salary_process_type: Optional[str] = None
    division: Optional[str] = None
    work_place: Optional[str] = None
    area: Optional[str] = None
    work_status: Optional[str] = None
    employee_level: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    swipe_card: Optional[str] = None
    status: str = "active"
    termination_date: Optional[date] = None


class EmployeeUpdate(BaseModel):
    """직원 수정 스키마"""
    model_config = ConfigDict(extra="ignore")

    company_id: Optional[int] = None
    name: Optional[str] = None
    name_en: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    job_level: Optional[str] = None
    employment_type: Optional[str] = None
    salary_process_type: Optional[str] = None
    division: Optional[str] = None
    work_place: Optional[str] = None
    area: Optional[str] = None
    work_status: Optional[str] = None
    employee_level: Optional[str] = None
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    base_salary: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    termination_date: Optional[date] = None
    education_activity_study: Optional[str] = None
    education_certificate: Optional[str] = None
    swipe_card: Optional[str] = None


class EmployeeResponse(EmployeeBase):
    """직원 응답 스키마"""
    model_config = ConfigDict(from_attributes=True)

    # DB/레거시 데이터에 비표준 도메인(예: .local)이 있을 수 있어 응답 직렬화는 EmailStr 제약을 쓰지 않음.
    email: str
    id: int
    status: str
    department_item_id: Optional[int] = None
    job_level_item_id: Optional[int] = None
    position_item_id: Optional[int] = None
    employment_type_item_id: Optional[int] = None
    salary_process_type_item_id: Optional[int] = None
    division_item_id: Optional[int] = None
    work_place_item_id: Optional[int] = None
    area_item_id: Optional[int] = None
    work_status_item_id: Optional[int] = None
    employee_level_item_id: Optional[int] = None
    base_salary: Optional[float] = None
    name_en: Optional[str] = None
    job_level: Optional[str] = None
    employment_type: Optional[str] = None
    salary_process_type: Optional[str] = None
    division: Optional[str] = None
    work_place: Optional[str] = None
    area: Optional[str] = None
    work_status: Optional[str] = None
    employee_level: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    termination_date: Optional[date] = None
    currency: Optional[str] = None
    education_activity_study: Optional[str] = None
    education_certificate: Optional[str] = None
    swipe_card: Optional[str] = None
    photo_path: Optional[str] = None
    resident_number: Optional[str] = None

    @model_validator(mode="after")
    def _mask_resident_number_response(self):
        """DB에 암호화 저장된 값은 복호화 후 마스킹하여 내려줌"""
        rn = self.resident_number
        if not rn:
            return self
        try:
            plain = decrypt_sensitive_data(rn)
        except Exception:
            # 레거시 평문 저장 등 복호화 실패 시 원문 기준 마스킹 시도
            self.resident_number = mask_resident_number_for_display(rn) or None
            return self
        self.resident_number = mask_resident_number_for_display(plain) or None
        return self


