"""회사별 Minor 코드 기준정보 모델"""
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String
from sqlalchemy.schema import UniqueConstraint

from app.models.base import BaseModel


class MinorCode(BaseModel):
    __tablename__ = "minor_codes"

    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    major_code_id = Column(
        Integer,
        ForeignKey("major_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    minor_code = Column(String(50), nullable=False)
    code_definition_type = Column(String(30), nullable=False, default="User Defined")
    name_kor = Column(String(300), nullable=True)
    name_eng = Column(String(300), nullable=True)
    name_thai = Column(String(300), nullable=True)
    note = Column(String(1000), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "major_code_id",
            "minor_code",
            name="uq_minor_codes_company_major_minor_code",
        ),
        CheckConstraint(
            "code_definition_type IN ('User Defined', 'System Defined')",
            name="ck_minor_codes_definition_type",
        ),
    )

    def __repr__(self) -> str:
        return f"<MinorCode {self.company_id}:{self.major_code_id}:{self.minor_code}>"

