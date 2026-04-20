"""직원 경력사항 스키마"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeCareerBase(BaseModel):
    position_title: Optional[str] = None
    work_details: Optional[str] = None
    enter_date: Optional[date] = None
    resigned_date: Optional[date] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    telephone: Optional[str] = None
    begin_salary: Optional[str] = None
    resignation_reason: Optional[str] = None
    latest_salary: Optional[str] = None
    tenure_text: Optional[str] = None


class EmployeeCareerCreate(EmployeeCareerBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeCareerUpdate(EmployeeCareerBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeCareerResponse(EmployeeCareerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    sort_order: int


class EmployeeCareerBulkSave(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rows: list[dict] = Field(default_factory=list)
