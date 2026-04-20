"""직원별 근태 마스터 (탭별 1:1·특수수당 N행)."""
from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeAttendanceMaster(BaseModel):
    __tablename__ = "employee_attendance_master"
    __table_args__ = (UniqueConstraint("employee_id", name="uq_employee_attendance_master_employee"),)

    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    card_code_extra = Column(String(80), nullable=True)

    basic = relationship(
        "EmployeeAttendanceMasterBasic",
        back_populates="master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    ot = relationship(
        "EmployeeAttendanceMasterOt",
        back_populates="master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    special_charges = relationship(
        "EmployeeAttendanceSpecialCharge",
        back_populates="master",
        cascade="all, delete-orphan",
        order_by="EmployeeAttendanceSpecialCharge.slot_index",
    )
    shift_setting = relationship(
        "EmployeeAttendanceShiftSetting",
        back_populates="master",
        uselist=False,
        cascade="all, delete-orphan",
    )
    leave_balance = relationship(
        "EmployeeAttendanceLeaveBalance",
        back_populates="master",
        uselist=False,
        cascade="all, delete-orphan",
    )


class EmployeeAttendanceMasterBasic(BaseModel):
    __tablename__ = "employee_attendance_master_basic"

    master_id = Column(
        Integer,
        ForeignKey("employee_attendance_master.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    employment_starting_date = Column(Date, nullable=True)
    end_probation_date = Column(Date, nullable=True)
    probation_days = Column(Integer, nullable=True)
    days_experience_text = Column(String(50), nullable=True)
    annual_holiday_form = Column(String(200), nullable=True)
    master_shiftwork_id = Column(
        Integer,
        ForeignKey("attendance_shift_group_master.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # legacy column kept for backward compatibility/migration history
    master_shiftwork = Column(String(200), nullable=True)

    check_in_zip_card = Column(Boolean, nullable=False, default=False)
    check_out_zip_card = Column(Boolean, nullable=False, default=False)
    received_food_allow = Column(Boolean, nullable=False, default=False)
    not_charge_early = Column(Boolean, nullable=False, default=False)
    not_rounding_early = Column(Boolean, nullable=False, default=False)
    received_shift_payment = Column(Boolean, nullable=False, default=False)
    not_charge_lateness = Column(Boolean, nullable=False, default=False)
    not_rounding_lateness = Column(Boolean, nullable=False, default=False)
    day_and_ot_zero = Column(Boolean, nullable=False, default=False)

    deduct_baht_per_minute = Column(Numeric(12, 4), nullable=True)
    deduct_early_checkout_baht = Column(Numeric(12, 4), nullable=True)
    charge_type = Column(String(100), nullable=True)

    master = relationship("EmployeeAttendanceMaster", back_populates="basic")


class EmployeeAttendanceMasterOt(BaseModel):
    __tablename__ = "employee_attendance_master_ot"

    master_id = Column(
        Integer,
        ForeignKey("employee_attendance_master.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    not_cut_ot = Column(Boolean, nullable=False, default=False)
    not_charge_ot_send_payroll = Column(Boolean, nullable=False, default=False)
    ot_pay_each_hour_ot6 = Column(Boolean, nullable=False, default=False)
    chang_all_ot6 = Column(Boolean, nullable=False, default=False)
    auto_ot_on_holiday = Column(Boolean, nullable=False, default=False)
    auto_ot_exclude_holidays = Column(Boolean, nullable=False, default=False)
    ot6_hourly_baht = Column(Numeric(12, 4), nullable=True)
    ui_lunchtime_by_emp_baht = Column(Numeric(12, 4), nullable=True)

    master = relationship("EmployeeAttendanceMaster", back_populates="ot")


class EmployeeAttendanceSpecialCharge(BaseModel):
    __tablename__ = "employee_attendance_special_charge"
    __table_args__ = (
        UniqueConstraint("master_id", "slot_index", name="uq_easc_master_slot"),
    )

    master_id = Column(
        Integer,
        ForeignKey("employee_attendance_master.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slot_index = Column(Integer, nullable=False)
    label = Column(String(200), nullable=False, default="")
    amount_baht = Column(Numeric(12, 4), nullable=False, default=0)

    master = relationship("EmployeeAttendanceMaster", back_populates="special_charges")


class EmployeeAttendanceShiftSetting(BaseModel):
    __tablename__ = "employee_attendance_shift_setting"

    master_id = Column(
        Integer,
        ForeignKey("employee_attendance_master.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    schedule_mode = Column(String(20), nullable=False, default="week")

    sun_enabled = Column(Boolean, nullable=False, default=False)
    sun_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    sun_shift_value = Column(String(100), nullable=True)
    mon_enabled = Column(Boolean, nullable=False, default=True)
    mon_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    mon_shift_value = Column(String(100), nullable=True)
    tue_enabled = Column(Boolean, nullable=False, default=True)
    tue_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    tue_shift_value = Column(String(100), nullable=True)
    wed_enabled = Column(Boolean, nullable=False, default=True)
    wed_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    wed_shift_value = Column(String(100), nullable=True)
    thu_enabled = Column(Boolean, nullable=False, default=True)
    thu_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    thu_shift_value = Column(String(100), nullable=True)
    fri_enabled = Column(Boolean, nullable=False, default=True)
    fri_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    fri_shift_value = Column(String(100), nullable=True)
    sat_enabled = Column(Boolean, nullable=False, default=False)
    sat_shift_id = Column(Integer, ForeignKey("attendance_shift.id", ondelete="RESTRICT"), nullable=True)
    sat_shift_value = Column(String(100), nullable=True)

    master = relationship("EmployeeAttendanceMaster", back_populates="shift_setting")


class EmployeeAttendanceLeaveBalance(BaseModel):
    __tablename__ = "employee_attendance_leave_balance"

    master_id = Column(
        Integer,
        ForeignKey("employee_attendance_master.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    leave_year = Column(Integer, nullable=False, default=2026)

    prev_days = Column(Integer, nullable=True)
    prev_hours = Column(Integer, nullable=True)
    prev_minutes = Column(Integer, nullable=True)
    transferred_days = Column(Integer, nullable=True)
    transferred_hours = Column(Integer, nullable=True)
    transferred_minutes = Column(Integer, nullable=True)
    used_days = Column(Integer, nullable=True)
    used_hours = Column(Integer, nullable=True)
    used_minutes = Column(Integer, nullable=True)
    year_days = Column(Integer, nullable=True)
    year_hours = Column(Integer, nullable=True)
    year_minutes = Column(Integer, nullable=True)

    level_of_leave = Column(String(50), nullable=True)
    compensate_accumulated = Column(String(10), nullable=True)

    master = relationship("EmployeeAttendanceMaster", back_populates="leave_balance")
