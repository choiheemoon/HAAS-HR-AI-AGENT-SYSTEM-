"""추가 OT(Regular OT asking 등) 신청 구간 — 레거시 OT asking 그리드."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text

from app.models.base import Base


class AttendanceAdditionalOt(Base):
    """직원·근무일별 다건 가능한 OT 신청(시작/종료 시각·유형 등)."""

    __tablename__ = "attendance_additional_ot"
    __table_args__ = (Index("ix_attendance_additional_ot_emp_day", "employee_id", "work_date"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)

    ot_type = Column(String(120), nullable=False)
    ot_start = Column(String(8), nullable=False)
    ot_end = Column(String(8), nullable=False)
    total_minutes = Column(Integer, nullable=True)

    type_ot = Column(String(40), nullable=False, default="Pay")
    job_title_code = Column(Integer, nullable=False, default=0)
    ot_breaktime_type = Column(Integer, nullable=False, default=1)
    block_payment = Column(Boolean, nullable=False, default=False)
    approve_status = Column(String(80), nullable=False, default="Approve")
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
