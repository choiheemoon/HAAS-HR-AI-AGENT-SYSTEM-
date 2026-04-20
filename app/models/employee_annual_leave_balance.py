"""직원 연도별 연차 잔액."""
from sqlalchemy import Column, Date, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import BaseModel


class EmployeeAnnualLeaveBalance(BaseModel):
    __tablename__ = "employee_annual_leave_balance"
    __table_args__ = (
        UniqueConstraint("employee_id", "leave_year", name="uq_employee_annual_leave_employee_year"),
    )

    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)
    leave_year = Column(Integer, nullable=False, index=True)

    base_date = Column(Date, nullable=True)
    service_days = Column(Integer, nullable=True)
    generated_days = Column(Integer, nullable=True)

    prev_days = Column(Integer, nullable=True)
    prev_hours = Column(Integer, nullable=True)
    prev_minutes = Column(Integer, nullable=True)
    transferred_days = Column(Integer, nullable=True)
    transferred_hours = Column(Integer, nullable=True)
    transferred_minutes = Column(Integer, nullable=True)
    used_days = Column(Integer, nullable=True)
    used_hours = Column(Integer, nullable=True)
    used_minutes = Column(Integer, nullable=True)
    year_days = Column(Integer, nullable=True)
    year_hours = Column(Integer, nullable=True)
    year_minutes = Column(Integer, nullable=True)

    level_of_leave = Column(String(50), nullable=True)
    compensate_accumulated = Column(String(10), nullable=True)
