"""직원 외국인 정보 (직원당 1행)"""
from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeForeignerInfo(BaseModel):
    __tablename__ = "employee_foreigner_info"
    __table_args__ = (UniqueConstraint("employee_id", name="uq_employee_foreigner_info_employee_id"),)

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    is_foreigner = Column(Boolean, nullable=False, default=False)

    passport_number = Column(String(100), nullable=True)
    passport_issue_place = Column(String(200), nullable=True)
    passport_issue_date = Column(Date, nullable=True)
    passport_expire_date = Column(Date, nullable=True)
    passport_note = Column(Text, nullable=True)

    visa_number = Column(String(100), nullable=True)
    visa_issue_place = Column(String(200), nullable=True)
    visa_issue_date = Column(Date, nullable=True)
    visa_expire_date = Column(Date, nullable=True)
    visa_note = Column(Text, nullable=True)

    work_permit_number = Column(String(100), nullable=True)
    work_permit_issue_place = Column(String(200), nullable=True)
    work_permit_issue_date = Column(Date, nullable=True)
    work_permit_expire_date = Column(Date, nullable=True)
    work_permit_note = Column(Text, nullable=True)

    employee = relationship("Employee", back_populates="foreigner_info")

    def __repr__(self):
        return f"<EmployeeForeignerInfo emp={self.employee_id} id={self.id}>"
