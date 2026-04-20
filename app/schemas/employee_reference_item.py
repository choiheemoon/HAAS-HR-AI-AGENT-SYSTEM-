"""회사별 인사기준정보(기준값) 스키마"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class EmployeeReferenceItemBase(BaseModel):
    company_id: int
    # API에서 category는 query param으로 전달하며,
    # body에는 company_id/code/name만 보내도 되도록 optional 처리합니다.
    category: Optional[str] = None
    code: str
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None

    @field_validator("category", mode="before")
    @classmethod
    def strip_category(cls, v):
        if v is None:
            return None
        return str(v).strip()

    @field_validator("code", mode="before")
    @classmethod
    def strip_code(cls, v):
        return (v or "").strip()


class EmployeeReferenceItemCreate(EmployeeReferenceItemBase):
    model_config = ConfigDict(extra="ignore")


class EmployeeReferenceItemUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # code/company_id/category는 수정하지 않음(서버에서 무시)
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None

    @field_validator("name_kor", "name_eng", "name_thai", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        if v == "":
            return None
        return v


class EmployeeReferenceItemResponse(EmployeeReferenceItemBase):
    model_config = ConfigDict(from_attributes=True)

    category: str
    id: int

