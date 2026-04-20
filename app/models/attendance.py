"""근태관리 모델"""
import enum
from sqlalchemy import Column, String, Date, DateTime, Integer, Float, Boolean, ForeignKey, Text, JSON, Time
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import datetime, date, time


class AttendanceType(enum.Enum):
    """출퇴근 타입"""
    CHECK_IN = "check_in"
    CHECK_OUT = "check_out"
    BREAK_START = "break_start"
    BREAK_END = "break_end"


class Attendance(BaseModel):
    """출퇴근 기록"""
    __tablename__ = "attendances"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    
    # 출퇴근 시간
    check_in_time = Column(DateTime)
    check_out_time = Column(DateTime)
    break_start_time = Column(DateTime)
    break_end_time = Column(DateTime)
    
    # 근무 시간
    work_hours = Column(Float)  # 실제 근무 시간 (시간)
    overtime_hours = Column(Float)  # 연장 근무 시간
    night_hours = Column(Float)  # 야간 근무 시간
    
    # 기록 방법
    record_method = Column(String(50))  # mobile, web, kiosk, qr, pin, biometric
    location = Column(JSON)  # GPS 좌표 (lat, lng)
    ip_address = Column(String(50))
    
    # 상태
    status = Column(String(50))  # normal, late, early_leave, absent, overtime
    notes = Column(Text)
    
    # 프로젝트별 시간
    project_hours = Column(JSON)  # {project_id: hours}
    
    # 관계
    employee = relationship("Employee", back_populates="attendances")
    
    def __repr__(self):
        return f"<Attendance {self.id}: Employee {self.employee_id} - {self.attendance_date}>"


class LeaveType(enum.Enum):
    """휴가 타입"""
    ANNUAL = "annual"  # 연차
    SICK = "sick"  # 병가
    PERSONAL = "personal"  # 개인사유
    MATERNITY = "maternity"  # 출산휴가
    PATERNITY = "paternity"  # 육아휴가
    UNPAID = "unpaid"  # 무급휴가
    OTHER = "other"  # 기타


class LeaveStatus(enum.Enum):
    """휴가 상태"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Leave(BaseModel):
    """휴가 신청"""
    __tablename__ = "leaves"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    
    leave_type = Column(String(50), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days = Column(Float, nullable=False)  # 휴가 일수
    
    status = Column(String(50), default=LeaveStatus.PENDING.value)
    reason = Column(Text)
    
    # 승인 정보
    approver_id = Column(Integer, ForeignKey("employees.id"))
    approved_at = Column(DateTime)
    approval_notes = Column(Text)
    
    # 관계
    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="leaves")
    approver = relationship("Employee", foreign_keys=[approver_id])
    
    def __repr__(self):
        return f"<Leave {self.id}: Employee {self.employee_id} - {self.leave_type}>"


class Schedule(BaseModel):
    """근무 스케줄"""
    __tablename__ = "schedules"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    schedule_date = Column(Date, nullable=False, index=True)
    
    # 근무 시간
    start_time = Column(Time)
    end_time = Column(Time)
    break_duration = Column(Integer)  # 분 단위
    
    # 스케줄 타입
    schedule_type = Column(String(50))  # regular, shift, flexible, remote
    shift_name = Column(String(100))
    
    # 상태
    is_holiday = Column(Boolean, default=False)
    is_weekend = Column(Boolean, default=False)
    notes = Column(Text)
    
    def __repr__(self):
        return f"<Schedule {self.id}: Employee {self.employee_id} - {self.schedule_date}>"
