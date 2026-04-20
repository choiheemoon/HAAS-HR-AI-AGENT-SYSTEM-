"""직원 개인정보 스키마"""
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EmployeePersonalInfoBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nickname: Optional[str] = None
    place_of_birth: Optional[str] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None
    race: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    blood_group: Optional[str] = None
    personal_tel: Optional[str] = None
    personal_email: Optional[str] = None
    website: Optional[str] = None
    military_status: Optional[str] = None
    personal_notes: Optional[str] = None
    hobby: Optional[str] = None
    sports: Optional[str] = None
    typing_thai_wpm: Optional[int] = None
    typing_english_wpm: Optional[int] = None
    has_driving_license: bool = False
    driving_license_number: Optional[str] = None
    own_car: bool = False
    has_motorcycle_license: bool = False
    motorcycle_license_number: Optional[str] = None
    own_motorcycle: bool = False


class EmployeePersonalInfoCreate(EmployeePersonalInfoBase):
    pass


class EmployeePersonalInfoUpdate(EmployeePersonalInfoBase):
    pass


class EmployeePersonalInfoResponse(EmployeePersonalInfoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
