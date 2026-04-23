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

from app.models.base import Base


class AttendanceTimeDay(Base):
    """직원·근무일 단위 1행. 휴가·결석·수당·집계 메타·agg_* 분해는 전부 명시 컬럼으로 저장."""

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

    # 과거 extra_json 에 있던 필드 — 컬럼화(대용량 JSONB 제거)
    fuel_allowance = Column(Float, nullable=True)
    standing_allowance = Column(Float, nullable=True)
    other_allowance = Column(Float, nullable=True)
    leave_time = Column(Integer, nullable=True)
    leave_without_pay = Column(Integer, nullable=True)
    leave_days = Column(Float, nullable=True)
    leave_without_pay_days = Column(Float, nullable=True)
    absent_time = Column(Integer, nullable=True)
    absent_days = Column(Float, nullable=True)
    work_day_count = Column(String(32), nullable=True)

    agg_punch_oth1 = Column(Integer, nullable=True)
    agg_punch_oth2 = Column(Integer, nullable=True)
    agg_punch_oth3 = Column(Integer, nullable=True)
    agg_punch_oth4 = Column(Integer, nullable=True)
    agg_punch_oth5 = Column(Integer, nullable=True)
    agg_punch_oth6 = Column(Integer, nullable=True)
    agg_additional_oth1 = Column(Integer, nullable=True)
    agg_additional_oth2 = Column(Integer, nullable=True)
    agg_additional_oth3 = Column(Integer, nullable=True)
    agg_additional_oth4 = Column(Integer, nullable=True)
    agg_additional_oth5 = Column(Integer, nullable=True)
    agg_additional_oth6 = Column(Integer, nullable=True)
    agg_special_oth1 = Column(Integer, nullable=True)
    agg_special_oth2 = Column(Integer, nullable=True)
    agg_special_oth3 = Column(Integer, nullable=True)
    agg_special_oth4 = Column(Integer, nullable=True)
    agg_special_oth5 = Column(Integer, nullable=True)
    agg_special_oth6 = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
