"""직원 가족사항"""
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeFamily(BaseModel):
    __tablename__ = "employee_families"
    __table_args__ = (
        CheckConstraint(
            "domestic_foreign IS NULL OR domestic_foreign IN ('domestic', 'foreign')",
            name="ck_employee_families_domestic_foreign",
        ),
    )

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order = Column(Integer, nullable=False, default=0)

    name = Column(String(100), nullable=True)
    relation = Column(String(50), nullable=True)
    resident_number = Column(String(50), nullable=True)
    domestic_foreign = Column(String(20), nullable=True)
    highest_education = Column(String(100), nullable=True)
    occupation = Column(String(100), nullable=True)
    workplace = Column(String(200), nullable=True)
    position = Column(String(100), nullable=True)
    support_reason = Column(String(200), nullable=True)

    employee = relationship("Employee", back_populates="families")

    def __repr__(self):
        return f"<EmployeeFamily emp={self.employee_id} id={self.id}>"
