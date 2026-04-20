"""직원 가족사항 스키마"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EmployeeFamilyBase(BaseModel):
    name: Optional[str] = None
    relation: Optional[str] = None
    resident_number: Optional[str] = None
    domestic_foreign: Optional[str] = None
    highest_education: Optional[str] = None
    occupation: Optional[str] = None
    workplace: Optional[str] = None
    position: Optional[str] = None
    support_reason: Optional[str] = None


class EmployeeFamilyCreate(EmployeeFamilyBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeFamilyUpdate(EmployeeFamilyBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeFamilyResponse(EmployeeFamilyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    sort_order: int


class EmployeeFamilyBulkSave(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rows: list[dict] = Field(default_factory=list)
