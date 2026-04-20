"""직원 학력 스키마"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import date


class EmployeeEducationBase(BaseModel):
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    institution: Optional[str] = None
    nationality: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    from_year: Optional[int] = Field(None, ge=1800, le=2100)
    to_year: Optional[int] = Field(None, ge=1800, le=2100)
    grade: Optional[str] = None
    note: Optional[str] = None
    educational_qualification: Optional[str] = None


class EmployeeEducationCreate(EmployeeEducationBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeEducationUpdate(EmployeeEducationBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeEducationResponse(EmployeeEducationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    sort_order: int
    degree_minor_code_id: Optional[int] = None
    field_of_study_minor_code_id: Optional[int] = None
    institution_minor_code_id: Optional[int] = None
    nationality_minor_code_id: Optional[int] = None


class EmployeeEducationBulkSave(BaseModel):
    model_config = ConfigDict(extra="ignore")

    education_activity_study: Optional[str] = None
    education_certificate: Optional[str] = None
    rows: list[dict] = Field(default_factory=list)
