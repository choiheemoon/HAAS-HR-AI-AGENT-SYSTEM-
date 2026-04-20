"""회사별 급여형태(EMPLOYEE TYPE) 기준정보 모델"""
from sqlalchemy import Column, ForeignKey, String, Integer
from sqlalchemy.schema import UniqueConstraint

from app.models.base import BaseModel


class EmployeeType(BaseModel):
    __tablename__ = "employee_types"

    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 회사별 유니크 코드
    employee_type_code = Column(String(50), nullable=False)

    # 다국어 명칭
    name_kor = Column(String(300), nullable=True)
    name_eng = Column(String(300), nullable=True)
    name_thai = Column(String(300), nullable=True)

    __table_args__ = (
        UniqueConstraint("company_id", "employee_type_code", name="uq_employee_types_company_employee_type_code"),
    )

    def __repr__(self) -> str:
        return f"<EmployeeType {self.company_id}:{self.employee_type_code}>"

