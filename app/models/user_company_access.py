"""사용자별 접근 가능 회사(기준정보 회사 마스터)"""
from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint

from app.models.base import BaseModel


class UserCompanyAccess(BaseModel):
    __tablename__ = "user_company_access"
    __table_args__ = (
        UniqueConstraint("user_id", "company_id", name="uq_user_company_access_user_company"),
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
