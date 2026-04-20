"""특별 OT 등록 — OT 배수별 시간·수당 관련 필드(레거시 특별 OT 그리드)."""

from datetime import datetime

from sqlalchemy import BigInteger, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text

from app.models.base import Base


class AttendanceSpecialOt(Base):
    """직원별 특별 OT 신청(기간 + OT.1~3·6, 교대, 비고 등)."""

    __tablename__ = "attendance_special_ot"
    __table_args__ = (Index("ix_attendance_special_ot_emp_dates", "employee_id", "date_from", "date_to"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)

    date_from = Column(Date, nullable=False, index=True)
    date_to = Column(Date, nullable=False, index=True)

    ot_1 = Column(String(8), nullable=False, default="")
    ot_1_5 = Column(String(8), nullable=False, default="")
    ot_2 = Column(String(8), nullable=False, default="")
    ot_2_5 = Column(String(8), nullable=False, default="")
    ot_3 = Column(String(8), nullable=False, default="")
    ot_6 = Column(String(8), nullable=False, default="")

    shift_slot = Column(Integer, nullable=False, default=1)  # 1 or 2
    shift_text = Column(String(120), nullable=False, default="")
    food = Column(String(120), nullable=False, default="")
    special = Column(String(120), nullable=False, default="")
    note = Column(Text, nullable=True)
    status = Column(String(80), nullable=False, default="Approve")

    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    updated_by_username = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
