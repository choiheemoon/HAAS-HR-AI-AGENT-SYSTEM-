"""직원 주소정보 (본적·현주소, 직원당 1행)"""
from sqlalchemy import Column, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeAddress(BaseModel):
    __tablename__ = "employee_addresses"
    __table_args__ = (UniqueConstraint("employee_id", name="uq_employee_addresses_employee_id"),)

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # 본적 (Permanent)
    perm_house_no_th = Column(String(100), nullable=True)
    perm_house_no_en = Column(String(100), nullable=True)
    perm_building_th = Column(String(200), nullable=True)
    perm_building_en = Column(String(200), nullable=True)
    perm_soi_th = Column(String(200), nullable=True)
    perm_soi_en = Column(String(200), nullable=True)
    perm_street_th = Column(Text, nullable=True)
    perm_street_en = Column(Text, nullable=True)
    perm_nationality = Column(String(200), nullable=True)
    perm_nationality_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_zone = Column(String(200), nullable=True)
    perm_zone_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_province = Column(String(200), nullable=True)
    perm_province_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_district = Column(String(200), nullable=True)
    perm_district_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_sub_district = Column(String(200), nullable=True)
    perm_sub_district_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_postcode = Column(String(30), nullable=True)
    perm_postcode_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    perm_telephone = Column(String(50), nullable=True)

    # 현주소 (Current)
    curr_house_no_th = Column(String(100), nullable=True)
    curr_house_no_en = Column(String(100), nullable=True)
    curr_building_th = Column(String(200), nullable=True)
    curr_building_en = Column(String(200), nullable=True)
    curr_soi_th = Column(String(200), nullable=True)
    curr_soi_en = Column(String(200), nullable=True)
    curr_street_th = Column(Text, nullable=True)
    curr_street_en = Column(Text, nullable=True)
    curr_nationality = Column(String(200), nullable=True)
    curr_nationality_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_zone = Column(String(200), nullable=True)
    curr_zone_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_province = Column(String(200), nullable=True)
    curr_province_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_district = Column(String(200), nullable=True)
    curr_district_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_sub_district = Column(String(200), nullable=True)
    curr_sub_district_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_postcode = Column(String(30), nullable=True)
    curr_postcode_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    curr_telephone = Column(String(50), nullable=True)

    employee = relationship("Employee", back_populates="address_record")

    def __repr__(self):
        return f"<EmployeeAddress emp={self.employee_id} id={self.id}>"
