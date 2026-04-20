"""회사 마스터 스키마"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional


class CompanyBase(BaseModel):
    company_code: str
    name_kor: Optional[str] = None
    name_thai: Optional[str] = None
    name_eng: Optional[str] = None
    representative_director_name: Optional[str] = None
    currency_unit: Optional[str] = None
    logo_data_url: Optional[str] = None
    address_no: Optional[str] = None
    soi: Optional[str] = None
    road: Optional[str] = None
    tumbon: Optional[str] = None
    amphur: Optional[str] = None
    province: Optional[str] = None
    zip_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    additional_info: Optional[str] = None
    webperson_sort_order: int = 0
    webperson_note: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_none(cls, v):
        if v == "":
            return None
        return v


class CompanyCreate(CompanyBase):
    model_config = ConfigDict(extra="ignore")


class CompanyUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name_kor: Optional[str] = None
    name_thai: Optional[str] = None
    name_eng: Optional[str] = None
    representative_director_name: Optional[str] = None
    currency_unit: Optional[str] = None
    logo_data_url: Optional[str] = None
    address_no: Optional[str] = None
    soi: Optional[str] = None
    road: Optional[str] = None
    tumbon: Optional[str] = None
    amphur: Optional[str] = None
    province: Optional[str] = None
    zip_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    additional_info: Optional[str] = None
    webperson_sort_order: Optional[int] = None
    webperson_note: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_none_u(cls, v):
        if v == "":
            return None
        return v


class CompanyResponse(CompanyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    system_group_code: str
