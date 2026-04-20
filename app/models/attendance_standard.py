"""회사별 근태 기준정보 (FK → companies)."""
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AttendanceCompanySettings(BaseModel):
    __tablename__ = "attendance_company_settings"

    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    daily_work_hours = Column(String(16), default="08:00")
    monthly_work_hours = Column(String(16), default="08:00")
    day_base_days_per_month = Column(Integer, default=30)
    ot_rate_level_1 = Column(Numeric(10, 4), default=1)
    ot_rate_level_2 = Column(Numeric(10, 4), default=1.5)
    ot_rate_level_3 = Column(Numeric(10, 4), default=2)
    ot_rate_level_4 = Column(Numeric(10, 4), default=2.5)
    ot_rate_level_5 = Column(Numeric(10, 4), default=3)
    processing_format = Column(String(100), default="normal")
    backward_cross_company = Column(Boolean, nullable=False, default=False)
    hide_time_status_no_check = Column(Boolean, nullable=False, default=False)
    zip_card_policy = Column(String(40), default="warning_full_day")
    zip_status_in = Column(String(200))
    zip_no_machine = Column(String(200))
    opt_remark_time_off = Column(Boolean, nullable=False, default=False)
    opt_message_time_off_charge = Column(Boolean, nullable=False, default=False)
    opt_message_leave = Column(Boolean, nullable=False, default=False)
    opt_late_check_half_day_leave = Column(Boolean, nullable=False, default=False)
    opt_process_record_leaves = Column(Boolean, nullable=False, default=False)
    opt_count_leave_in_schedule = Column(Boolean, nullable=False, default=False)
    opt_half_day_leave_half_base = Column(Boolean, nullable=False, default=False)


class AttendanceSpecialAllowance(BaseModel):
    __tablename__ = "attendance_special_allowance"
    __table_args__ = (UniqueConstraint("company_id", "slot_index", name="uq_att_spec_co_slot"),)

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index = Column(SmallInteger, nullable=False)
    name = Column(String(300))
    working_ot_on_holiday = Column(Boolean, nullable=False, default=False)
    payment_full_day = Column(Boolean, nullable=False, default=True)
    no_payment_late_early = Column(Boolean, nullable=False, default=False)


class AttendanceShiftGroupMaster(BaseModel):
    __tablename__ = "attendance_shift_group_master"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_att_shift_group_master_co_name"),)

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    name = Column(String(200), nullable=False)
    description = Column(Text)


class AttendanceShift(BaseModel):
    __tablename__ = "attendance_shift"
    __table_args__ = (UniqueConstraint("company_id", "shift_code", name="uq_att_shift_co_code"),)

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_code = Column(String(50), nullable=False)
    title = Column(String(500))
    start_check_in = Column(String(16))
    start_work = Column(String(16))
    lateness_count_start = Column(String(16))
    break_late_time = Column(String(16))
    break_late_enabled = Column(Boolean, nullable=False, default=False)
    break_early_time = Column(String(16))
    break_early_enabled = Column(Boolean, nullable=False, default=False)
    break_sum = Column(String(16))
    time_out = Column(String(16))
    continue_shift_without_zip_minutes = Column(Integer, default=0)
    work_on_holiday = Column(Boolean, nullable=False, default=False)
    late_enabled = Column(Boolean, nullable=False, default=False)
    late_threshold_minutes = Column(Integer, default=0)
    late_shift_note = Column(String(100))
    late_monthly_note = Column(String(100))
    early_enabled = Column(Boolean, nullable=False, default=False)
    leaves_enabled = Column(Boolean, nullable=False, default=False)
    leave_food_minutes = Column(Integer, default=0)
    leave_food_monthly = Column(Integer, default=0)
    leave_food_daily = Column(Integer, default=0)
    continuous_ot_minutes = Column(Integer, default=0)
    continuous_ot_after = Column(Boolean, nullable=False, default=False)
    continuous_ot_before = Column(Boolean, nullable=False, default=False)
    allowance_food = Column(Integer, default=0)
    allowance_food_monthly = Column(Integer, default=0)
    allowance_food_daily = Column(Integer, default=0)
    allowance_shift = Column(Integer, default=0)
    work_holiday_threshold_minutes = Column(Integer, default=0)
    work_holiday_daily = Column(Integer, default=0)
    work_holiday_monthly = Column(Integer, default=0)
    late_daily = Column(Integer, default=0)
    late_monthly = Column(Integer, default=0)
    early_threshold_minutes = Column(Integer, default=0)
    early_daily = Column(Integer, default=0)
    early_monthly = Column(Integer, default=0)
    leaves_threshold_minutes = Column(Integer, default=0)
    leaves_daily = Column(Integer, default=0)
    leaves_monthly = Column(Integer, default=0)
    food_daily = Column(Integer, default=0)
    food_monthly = Column(Integer, default=0)
    # 교대 OT 표 하단: 지각·Shift / 조퇴·식대 수당 (월급·시급 × 평일·일요·휴일)
    shift_allowance_late_shift_json = Column(JSONB, nullable=True)
    shift_allowance_early_food_json = Column(JSONB, nullable=True)

    ot_ranges = relationship(
        "AttendanceShiftOtRange",
        back_populates="shift",
        cascade="all, delete-orphan",
        order_by="AttendanceShiftOtRange.sort_order",
    )


class AttendanceShiftOtRange(BaseModel):
    __tablename__ = "attendance_shift_ot_range"
    __table_args__ = (UniqueConstraint("shift_id", "sort_order", name="uq_att_shift_ot_so"),)

    shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False)
    range_start = Column(String(16))
    range_end = Column(String(16))
    # 월급(M): a=평일, b=일요일, holiday=전통휴일 / 시급(D): 동일 (급여처리 유형 Monthly·Daily와 연동)
    monthly_rate_a = Column(Numeric(12, 4))
    monthly_rate_b = Column(Numeric(12, 4))
    monthly_rate_holiday = Column(Numeric(12, 4))
    daily_rate_a = Column(Numeric(12, 4))
    daily_rate_b = Column(Numeric(12, 4))
    daily_rate_holiday = Column(Numeric(12, 4))

    shift = relationship("AttendanceShift", back_populates="ot_ranges")


class AttendanceRoundUpSection(BaseModel):
    __tablename__ = "attendance_round_up_section"
    __table_args__ = (
        UniqueConstraint("company_id", "tab_key", "section_key", name="uq_att_ru_section"),
    )

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    tab_key = Column(String(32), nullable=False)
    section_key = Column(String(64), nullable=False)
    mode_code = Column(String(64))
    flag_payroll_include = Column(Boolean, nullable=False, default=False)
    flag_first_minute = Column(Boolean, nullable=False, default=False)
    flag_footer = Column(Boolean, nullable=False, default=False)
    flag_use_late_count = Column(Boolean, nullable=False, default=False)
    extra_json = Column(JSONB)

    tiers = relationship(
        "AttendanceRoundUpTier",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="AttendanceRoundUpTier.row_index",
    )


class AttendanceRoundUpTier(BaseModel):
    __tablename__ = "attendance_round_up_tier"
    __table_args__ = (UniqueConstraint("section_id", "row_index", name="uq_att_ru_tier"),)

    section_id = Column(
        Integer,
        ForeignKey("attendance_round_up_section.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_index = Column(Integer, nullable=False)
    value_from = Column(Integer, nullable=False, default=0)
    value_to = Column(Integer, nullable=False, default=0)
    rounded_minutes = Column(Integer, nullable=False, default=0)

    section = relationship("AttendanceRoundUpSection", back_populates="tiers")


class AttendanceLeaveLevel(BaseModel):
    __tablename__ = "attendance_leave_level"
    __table_args__ = (UniqueConstraint("company_id", "level_number", name="uq_att_leave_lv"),)

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    level_number = Column(Integer, nullable=False)
    # 등급별 누적·시작일 등 (기존 attendance_leave_global 단일 행에서 분리)
    statutory_start_date = Column(Date)
    leave_other_start_date = Column(Date)
    cumulative_year = Column(Integer)
    summer_employee_plus_one = Column(Boolean, nullable=False, default=False)
    display_start_date = Column(Date)
    thai_notice_text = Column(Text)
    certificate_web_path = Column(String(500))

    rows = relationship(
        "AttendanceLeaveLevelRow",
        back_populates="leave_level",
        cascade="all, delete-orphan",
        order_by="AttendanceLeaveLevelRow.sort_order",
    )


class AttendanceLeaveLevelRow(BaseModel):
    __tablename__ = "attendance_leave_level_row"

    leave_level_id = Column(
        Integer,
        ForeignKey("attendance_leave_level.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order = Column(Integer, nullable=False, default=0)
    leave_type_name = Column(String(200), nullable=False, default="")
    days_quota = Column(Numeric(12, 2), default=0)
    hours_quota = Column(Integer, default=0)
    minutes_quota = Column(Integer, default=0)
    option_checked = Column(Boolean, nullable=False, default=False)

    leave_level = relationship("AttendanceLeaveLevel", back_populates="rows")


class AttendanceLeaveGlobal(BaseModel):
    __tablename__ = "attendance_leave_global"

    company_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    statutory_start_date = Column(Date)
    leave_other_start_date = Column(Date)
    cumulative_year = Column(Integer)
    summer_employee_plus_one = Column(Boolean, nullable=False, default=False)
    display_start_date = Column(Date)
    thai_notice_text = Column(Text)
    certificate_web_path = Column(String(500))


class AttendanceCompanyHoliday(BaseModel):
    __tablename__ = "attendance_company_holiday"
    __table_args__ = (UniqueConstraint("company_id", "holiday_date", name="uq_att_co_holiday"),)

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    holiday_date = Column(Date, nullable=False)
    remarks = Column(Text)


class AttendancePaymentPeriod(BaseModel):
    __tablename__ = "attendance_payment_period"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "calendar_year",
            "calendar_month",
            "period_label",
            name="uq_att_pay_period",
        ),
    )

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    calendar_year = Column(Integer, nullable=False)
    calendar_month = Column(Integer, nullable=False)
    period_label = Column(String(100), nullable=False, default="Period 1")
    start_date_daily = Column(Date)
    end_date_daily = Column(Date)
    start_date_monthly = Column(Date)
    end_date_monthly = Column(Date)
    ot_start_daily = Column(Date)
    ot_end_daily = Column(Date)
    ot_start_monthly = Column(Date)
    ot_end_monthly = Column(Date)
    is_closed = Column(Boolean, nullable=False, default=False)
    closed_at = Column(Date)
    closed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    remarks = Column(Text)


class AttendanceWorkCalendar(BaseModel):
    __tablename__ = "attendance_work_calendar"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "calendar_year",
            "calendar_month",
            "shift_group_id",
            name="uq_att_work_calendar_group",
        ),
    )

    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    calendar_year = Column(Integer, nullable=False)
    calendar_month = Column(Integer, nullable=False)
    shift_group_id = Column(
        Integer,
        ForeignKey("attendance_shift_group_master.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    shift_group_name = Column(String(200))
    # 레거시: 달력 헤더를 교대 FK로 두던 시기(일별 교대는 days.shift_code 사용)
    shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True, index=True)
    shift_code = Column(String(50))

    days = relationship(
        "AttendanceWorkCalendarDay",
        back_populates="calendar",
        cascade="all, delete-orphan",
        order_by="AttendanceWorkCalendarDay.day_of_month",
    )
    shift_group = relationship("AttendanceShiftGroupMaster")
    shift = relationship("AttendanceShift")


class AttendanceWorkCalendarDay(BaseModel):
    __tablename__ = "attendance_work_calendar_day"
    __table_args__ = (
        UniqueConstraint("calendar_id", "day_of_month", name="uq_att_work_calendar_day"),
        ForeignKeyConstraint(
            ("company_id", "shift_code"),
            ("attendance_shift.company_id", "attendance_shift.shift_code"),
            name="fk_att_work_calendar_day_co_shift_code",
            ondelete="RESTRICT",
        ),
    )

    calendar_id = Column(
        Integer,
        ForeignKey("attendance_work_calendar.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_month = Column(Integer, nullable=False)
    shift_code = Column(String(50))
    shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True, index=True)
    is_workday = Column(Boolean, nullable=False, default=True)

    calendar = relationship("AttendanceWorkCalendar", back_populates="days")
    shift = relationship("AttendanceShift", foreign_keys=[shift_id])
