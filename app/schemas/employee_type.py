"""급여형태(EMPLOYEE TYPE) 기준정보 스키마"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class EmployeeTypeBase(BaseModel):
    company_id: int
    employee_type_code: str
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None

    @field_validator("employee_type_code", mode="before")
    @classmethod
    def empty_code_strip(cls, v):
        return (v or "").strip()


class EmployeeTypeCreate(EmployeeTypeBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeTypeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # 업데이트에서는 company_id / employee_type_code 수정 불가(서버에서 무시)
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None


class EmployeeTypeResponse(EmployeeTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

