"""직원 경력사항"""
from sqlalchemy import Column, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeCareer(BaseModel):
    __tablename__ = "employee_careers"

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order = Column(Integer, nullable=False, default=0)

    position_title = Column(String(200), nullable=True)
    work_details = Column(Text, nullable=True)
    enter_date = Column(Date, nullable=True)
    resigned_date = Column(Date, nullable=True)
    company_name = Column(String(300), nullable=True)
    address = Column(String(500), nullable=True)
    telephone = Column(String(50), nullable=True)
    begin_salary = Column(String(100), nullable=True)
    resignation_reason = Column(Text, nullable=True)
    latest_salary = Column(String(100), nullable=True)
    tenure_text = Column(String(100), nullable=True)

    employee = relationship("Employee", back_populates="careers")

    def __repr__(self):
        return f"<EmployeeCareer emp={self.employee_id} id={self.id}>"
