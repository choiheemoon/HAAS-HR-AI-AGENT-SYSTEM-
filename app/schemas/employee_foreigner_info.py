"""직원 외국인 정보 스키마"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EmployeeForeignerInfoBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    is_foreigner: bool = False

    passport_number: Optional[str] = None
    passport_issue_place: Optional[str] = None
    passport_issue_date: Optional[date] = None
    passport_expire_date: Optional[date] = None
    passport_note: Optional[str] = None

    visa_number: Optional[str] = None
    visa_issue_place: Optional[str] = None
    visa_issue_date: Optional[date] = None
    visa_expire_date: Optional[date] = None
    visa_note: Optional[str] = None

    work_permit_number: Optional[str] = None
    work_permit_issue_place: Optional[str] = None
    work_permit_issue_date: Optional[date] = None
    work_permit_expire_date: Optional[date] = None
    work_permit_note: Optional[str] = None


class EmployeeForeignerInfoCreate(EmployeeForeignerInfoBase):
    pass


class EmployeeForeignerInfoUpdate(EmployeeForeignerInfoBase):
    pass


class EmployeeForeignerInfoResponse(EmployeeForeignerInfoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
