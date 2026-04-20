"""직원 어학정보 스키마"""
from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeLanguageBase(BaseModel):
    acquisition_date: Optional[date] = None
    language_code: Optional[str] = None
    test_type: Optional[str] = None
    score: Optional[int] = None
    grade: Optional[str] = None
    expiry_date: Optional[date] = None


class EmployeeLanguageCreate(EmployeeLanguageBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeLanguageUpdate(EmployeeLanguageBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeLanguageResponse(EmployeeLanguageBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    sort_order: int


class EmployeeLanguageBulkSave(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rows: list[dict] = Field(default_factory=list)
