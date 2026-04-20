"""일별 근태 집계 결과(레거시 TimeDay 계열) — 근태집계/계산 저장용."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import Base


class AttendanceTimeDay(Base):
    """
    직원·근무일 단위 1행. 첨부 스키마의 핵심 필드는 컬럼으로 두고,
    나머지(다수의 Leavel/OTH 세부 등)는 extra_json에 병합 저장 가능.
    """

    __tablename__ = "attendance_time_day"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_day", name="uq_attendance_time_day_emp_day"),
        Index("ix_attendance_time_day_work_row_id", "work_day", "row_no", "id"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_day = Column(Date, nullable=False, index=True)

    row_no = Column(Integer, nullable=True)
    no_of_shift = Column(String(2), nullable=True)
    shift_code = Column(String(20), nullable=True)

    time_in = Column(DateTime, nullable=True)
    time_out_break = Column(DateTime, nullable=True)
    time_in_break = Column(DateTime, nullable=True)
    time_out = Column(DateTime, nullable=True)

    late_time_in = Column(Integer, nullable=True)
    before_time_out_break = Column(Integer, nullable=True)
    before_time_out = Column(Integer, nullable=True)

    oth1 = Column(Integer, nullable=True)
    oth2 = Column(Integer, nullable=True)
    oth3 = Column(Integer, nullable=True)
    oth4 = Column(Integer, nullable=True)
    oth5 = Column(Integer, nullable=True)
    oth6 = Column(Integer, nullable=True)
    othb = Column(Float, nullable=True)

    type_ot = Column(String(10), nullable=True)
    day_memo = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    ck_pay_ot = Column(Boolean, nullable=False, default=False)
    user_chang = Column(String(200), nullable=True)

    st_in = Column(String(10), nullable=True)
    st_out = Column(String(10), nullable=True)
    st_bin = Column(String(10), nullable=True)
    st_bout = Column(String(10), nullable=True)

    day_food = Column(Float, nullable=True)
    day_wages = Column(Float, nullable=True)
    day_food_ot = Column(Float, nullable=True)
    day_wages_ot = Column(Float, nullable=True)
    day_food_over_ot = Column(Float, nullable=True)
    day_wages_over_ot = Column(Float, nullable=True)

    shift_allowance = Column(Float, nullable=True)
    shift_ot_allowance = Column(Float, nullable=True)
    shift_over_ot_allowance = Column(Float, nullable=True)
    food_allowance = Column(Float, nullable=True)
    food_ot_allowance = Column(Float, nullable=True)
    food_over_ot_allowance = Column(Float, nullable=True)
    special_ot_allowance = Column(Float, nullable=True)
    special_allowance = Column(Float, nullable=True)
    overtime_pay_local = Column(Float, nullable=True)
    shift_pay_local = Column(Float, nullable=True)

    doc_sick = Column(Boolean, nullable=False, default=False)
    without_pay_public_holiday = Column(Boolean, nullable=False, default=False)
    day_off = Column(Boolean, nullable=False, default=False)

    extra_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
