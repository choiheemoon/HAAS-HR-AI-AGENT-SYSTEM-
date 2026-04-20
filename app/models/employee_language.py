"""직원 어학정보 (다행)"""
from sqlalchemy import Column, Date, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeLanguage(BaseModel):
    __tablename__ = "employee_languages"

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order = Column(Integer, nullable=False, default=0)

    acquisition_date = Column(Date, nullable=True)
    language_code = Column(String(50), nullable=True)
    test_type = Column(String(50), nullable=True)
    score = Column(Integer, nullable=True)
    grade = Column(String(50), nullable=True)
    expiry_date = Column(Date, nullable=True)

    employee = relationship("Employee", back_populates="languages")

    def __repr__(self):
        return f"<EmployeeLanguage emp={self.employee_id} id={self.id}>"
