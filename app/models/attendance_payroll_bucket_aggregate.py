"""급여근태기간 기준 근태·OT·수당 집계 저장(근태/OT/수당집계 실행 시 UPSERT)."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)

from app.models.base import BaseModel


class AttendancePayrollBucketAggregate(BaseModel):
    """
    직원·연·월·기간·income_ot_only 단위 1행.
    자연키: employee_id + calendar_year + calendar_month + period_label + income_ot_only
    """

    __tablename__ = "attendance_payroll_bucket_aggregate"
    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "calendar_year",
            "calendar_month",
            "period_label",
            "income_ot_only",
            name="uq_att_payroll_bucket_agg_emp_period",
        ),
        Index(
            "ix_att_payroll_bucket_agg_co_emp_y",
            "company_id",
            "employee_id",
            "calendar_year",
        ),
    )

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    attendance_payment_period_id = Column(
        Integer, ForeignKey("attendance_payment_period.id", ondelete="SET NULL"), nullable=True, index=True
    )

    calendar_year = Column(Integer, nullable=False)
    calendar_month = Column(Integer, nullable=False)
    period_label = Column(String(100), nullable=False, default="Period 1")
    income_ot_only = Column(Boolean, nullable=False, default=False)

    pay_type = Column(String(20), nullable=True)
    range_main_start = Column(Date, nullable=True)
    range_main_end = Column(Date, nullable=True)
    range_ot_start = Column(Date, nullable=True)
    range_ot_end = Column(Date, nullable=True)

    holiday_days = Column(Integer, nullable=False, default=0)
    days_worked = Column(Integer, nullable=False, default=0)
    working_minutes = Column(Integer, nullable=False, default=0)
    absent_minutes = Column(Integer, nullable=False, default=0)
    late_minutes = Column(Integer, nullable=False, default=0)
    early_minutes = Column(Integer, nullable=False, default=0)
    leave_with_pay_minutes = Column(Integer, nullable=False, default=0)
    leave_without_pay_minutes = Column(Integer, nullable=False, default=0)

    oth1 = Column(Integer, nullable=False, default=0)
    oth2 = Column(Integer, nullable=False, default=0)
    oth3 = Column(Integer, nullable=False, default=0)
    oth4 = Column(Integer, nullable=False, default=0)
    oth5 = Column(Integer, nullable=False, default=0)
    oth6 = Column(Integer, nullable=False, default=0)
    oth1_weekday = Column(Integer, nullable=False, default=0)
    oth1_holiday = Column(Integer, nullable=False, default=0)
    oth2_weekday = Column(Integer, nullable=False, default=0)
    oth2_holiday = Column(Integer, nullable=False, default=0)
    oth3_weekday = Column(Integer, nullable=False, default=0)
    oth3_holiday = Column(Integer, nullable=False, default=0)
    oth4_weekday = Column(Integer, nullable=False, default=0)
    oth4_holiday = Column(Integer, nullable=False, default=0)
    oth5_weekday = Column(Integer, nullable=False, default=0)
    oth5_holiday = Column(Integer, nullable=False, default=0)
    oth6_weekday = Column(Integer, nullable=False, default=0)
    oth6_holiday = Column(Integer, nullable=False, default=0)
    othb = Column(Float, nullable=False, default=0.0)
    othb_weekday = Column(Float, nullable=False, default=0.0)
    othb_holiday = Column(Float, nullable=False, default=0.0)

    shift_allowance = Column(Float, nullable=False, default=0.0)
    food_allowance = Column(Float, nullable=False, default=0.0)
    special_allowance = Column(Float, nullable=False, default=0.0)
    fuel_allowance = Column(Float, nullable=False, default=0.0)
    standing_allowance = Column(Float, nullable=False, default=0.0)
    other_allowance = Column(Float, nullable=False, default=0.0)
    shift_ot_allowance = Column(Float, nullable=False, default=0.0)
    shift_over_ot_allowance = Column(Float, nullable=False, default=0.0)
    food_ot_allowance = Column(Float, nullable=False, default=0.0)
    food_over_ot_allowance = Column(Float, nullable=False, default=0.0)
    special_ot_allowance = Column(Float, nullable=False, default=0.0)
    overtime_pay_local = Column(Float, nullable=False, default=0.0)
    overtime_pay_local_weekday = Column(Float, nullable=False, default=0.0)
    overtime_pay_local_holiday = Column(Float, nullable=False, default=0.0)

    employee_number = Column(String(64), nullable=True)
    employee_name = Column(String(200), nullable=True)
    department = Column(String(200), nullable=True)

    computed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
