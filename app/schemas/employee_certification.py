"""직원 자격증 스키마"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCertificationBase(BaseModel):
    license_type_minor_code_id: Optional[int] = None
    issuer_minor_code_id: Optional[int] = None
    license_code: Optional[str] = None
    license_type_name: Optional[str] = None
    grade: Optional[str] = None
    issuer_code: Optional[str] = None
    issuer_name: Optional[str] = None
    acquired_date: Optional[date] = None
    effective_date: Optional[date] = None
    next_renewal_date: Optional[date] = None
    certificate_number: Optional[str] = None


class EmployeeCertificationCreate(EmployeeCertificationBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeCertificationUpdate(EmployeeCertificationBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeCertificationResponse(EmployeeCertificationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    sort_order: int


class EmployeeCertificationBulkSave(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rows: list[dict] = Field(default_factory=list)
