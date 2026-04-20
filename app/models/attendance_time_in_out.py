"""근태 조회(출퇴근·타각) 원장 — 레거시 TimeInOut 필드 매핑."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String

from app.models.base import Base


class AttendanceTimeInOut(Base):
    """
    첨부 스키마 기준 필드명 매핑 (DB 컬럼 snake_case).
    PK: id_time_in_out (BIGSERIAL)
    """

    __tablename__ = "attendance_time_in_out"

    id_time_in_out = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)

    id_card = Column(String(20), nullable=True)
    date_i = Column(DateTime, nullable=True)
    date_in_out = Column(DateTime, nullable=True)
    id_sin_out = Column(Integer, nullable=True)
    user_change = Column(String(100), nullable=True)
    machine_no = Column(String(20), nullable=True)
    location = Column(String(255), nullable=True)
    add_memo = Column(String(200), nullable=True)
    status_del = Column(Boolean, nullable=False, default=False)
    id_time_in_out_approve = Column(BigInteger, nullable=True)
    sync_status = Column(String(1), nullable=True)
    memo_ = Column(String(250), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
