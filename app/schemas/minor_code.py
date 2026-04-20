"""Minor 코드 기준정보 스키마"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


DefinitionType = Literal["User Defined", "System Defined"]


class MinorCodeBase(BaseModel):
    company_id: int
    major_code_id: int
    minor_code: str
    code_definition_type: DefinitionType = "User Defined"
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None
    note: Optional[str] = None

    @field_validator("minor_code", mode="before")
    @classmethod
    def strip_minor_code(cls, v):
        return (v or "").strip()


class MinorCodeCreate(MinorCodeBase):
    model_config = ConfigDict(extra="ignore")


class MinorCodeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code_definition_type: Optional[DefinitionType] = None
    name_kor: Optional[str] = None
    name_eng: Optional[str] = None
    name_thai: Optional[str] = None
    note: Optional[str] = None


class MinorCodeResponse(MinorCodeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

