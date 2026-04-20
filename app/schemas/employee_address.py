"""직원 주소정보 스키마"""
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EmployeeAddressBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    perm_house_no_th: Optional[str] = None
    perm_house_no_en: Optional[str] = None
    perm_building_th: Optional[str] = None
    perm_building_en: Optional[str] = None
    perm_soi_th: Optional[str] = None
    perm_soi_en: Optional[str] = None
    perm_street_th: Optional[str] = None
    perm_street_en: Optional[str] = None
    perm_nationality: Optional[str] = None
    perm_zone: Optional[str] = None
    perm_province: Optional[str] = None
    perm_district: Optional[str] = None
    perm_sub_district: Optional[str] = None
    perm_postcode: Optional[str] = None
    perm_telephone: Optional[str] = None

    curr_house_no_th: Optional[str] = None
    curr_house_no_en: Optional[str] = None
    curr_building_th: Optional[str] = None
    curr_building_en: Optional[str] = None
    curr_soi_th: Optional[str] = None
    curr_soi_en: Optional[str] = None
    curr_street_th: Optional[str] = None
    curr_street_en: Optional[str] = None
    curr_nationality: Optional[str] = None
    curr_zone: Optional[str] = None
    curr_province: Optional[str] = None
    curr_district: Optional[str] = None
    curr_sub_district: Optional[str] = None
    curr_postcode: Optional[str] = None
    curr_telephone: Optional[str] = None


class EmployeeAddressCreate(EmployeeAddressBase):
    pass


class EmployeeAddressUpdate(EmployeeAddressBase):
    pass


class EmployeeAddressResponse(EmployeeAddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    # minor_codes FK — 조회 화면에서 코드→명칭 해석용
    perm_nationality_minor_code_id: Optional[int] = None
    perm_zone_minor_code_id: Optional[int] = None
    perm_province_minor_code_id: Optional[int] = None
    perm_district_minor_code_id: Optional[int] = None
    perm_sub_district_minor_code_id: Optional[int] = None
    perm_postcode_minor_code_id: Optional[int] = None
    curr_nationality_minor_code_id: Optional[int] = None
    curr_zone_minor_code_id: Optional[int] = None
    curr_province_minor_code_id: Optional[int] = None
    curr_district_minor_code_id: Optional[int] = None
    curr_sub_district_minor_code_id: Optional[int] = None
    curr_postcode_minor_code_id: Optional[int] = None
