"""직원 개인정보(1인 1행)"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeePersonalInfo(BaseModel):
    __tablename__ = "employee_personal_info"
    __table_args__ = (UniqueConstraint("employee_id", name="uq_employee_personal_info_employee_id"),)

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    nickname = Column(String(100), nullable=True)
    place_of_birth = Column(String(200), nullable=True)
    height_cm = Column(Integer, nullable=True)
    weight_kg = Column(Integer, nullable=True)
    race = Column(String(100), nullable=True)
    nationality = Column(String(100), nullable=True)
    religion = Column(String(100), nullable=True)
    blood_group = Column(String(20), nullable=True)
    personal_tel = Column(String(50), nullable=True)
    personal_email = Column(String(255), nullable=True)
    website = Column(String(500), nullable=True)
    military_status = Column(String(100), nullable=True)
    personal_notes = Column(Text, nullable=True)

    hobby = Column(String(500), nullable=True)
    sports = Column(String(500), nullable=True)
    typing_thai_wpm = Column(Integer, nullable=True)
    typing_english_wpm = Column(Integer, nullable=True)

    has_driving_license = Column(Boolean, nullable=False, default=False)
    driving_license_number = Column(String(100), nullable=True)
    own_car = Column(Boolean, nullable=False, default=False)
    has_motorcycle_license = Column(Boolean, nullable=False, default=False)
    motorcycle_license_number = Column(String(100), nullable=True)
    own_motorcycle = Column(Boolean, nullable=False, default=False)

    employee = relationship("Employee", back_populates="personal_info")

    def __repr__(self):
        return f"<EmployeePersonalInfo emp={self.employee_id} id={self.id}>"
