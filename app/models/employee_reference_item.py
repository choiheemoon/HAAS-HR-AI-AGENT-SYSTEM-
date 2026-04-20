"""회사별 인사기준정보(기준값) 공통 모델"""

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.schema import UniqueConstraint

from app.models.base import BaseModel


class EmployeeReferenceItem(BaseModel):
    __tablename__ = "employee_reference_items"

    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 예: employee_type, employee_level, division, department, level, work_place, area, work_status
    category = Column(String(50), index=True, nullable=False)

    # 각 기준값의 코드
    code = Column(String(50), nullable=False)

    name_kor = Column(String(300), nullable=True)
    name_eng = Column(String(300), nullable=True)
    name_thai = Column(String(300), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "category",
            "code",
            name="uq_employee_reference_items_company_category_code",
        ),
    )

    def __repr__(self) -> str:
        return f"<EmployeeReferenceItem {self.company_id}:{self.category}:{self.code}>"

