"""Major 코드 기준정보 스키마"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


DefinitionType = Literal["User Defined", "System Defined"]


class MajorCodeBase(BaseModel):
    company_id: int
    major_code: str
    code_definition_type: DefinitionType = "User Defined"
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None
    note: Optional[str] = None

    @field_validator("major_code", mode="before")
    @classmethod
    def strip_major_code(cls, v):
        return (v or "").strip()


class MajorCodeCreate(MajorCodeBase):
    model_config = ConfigDict(extra="ignore")


class MajorCodeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code_definition_type: Optional[DefinitionType] = None
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None
    note: Optional[str] = None


class MajorCodeResponse(MajorCodeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

