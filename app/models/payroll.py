"""급여 모델"""
import enum
from sqlalchemy import Column, String, Date, Integer, Float, Boolean, ForeignKey, Text, JSON, DateTime
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import date


class PayrollStatus(enum.Enum):
    """급여 상태"""
    DRAFT = "draft"
    CALCULATED = "calculated"
    APPROVED = "approved"
    PAID = "paid"
    CANCELLED = "cancelled"


class Payroll(BaseModel):
    """급여"""
    __tablename__ = "payrolls"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    
    # 급여 기간
    pay_period_start = Column(Date, nullable=False)
    pay_period_end = Column(Date, nullable=False)
    pay_date = Column(Date, nullable=False)  # 지급일
    
    # 급여 금액
    gross_pay = Column(Float, default=0.0)  # 총 급여
    net_pay = Column(Float, default=0.0)  # 실수령액
    
    # 수당
    base_salary = Column(Float, default=0.0)
    allowances = Column(JSON)  # {allowance_type: amount}
    bonuses = Column(JSON)  # {bonus_type: amount}
    overtime_pay = Column(Float, default=0.0)
    other_earnings = Column(Float, default=0.0)
    
    # 공제
    tax_deductions = Column(JSON)  # {tax_type: amount}
    social_insurance = Column(JSON)  # {insurance_type: amount}
    other_deductions = Column(JSON)  # {deduction_type: amount}
    total_deductions = Column(Float, default=0.0)
    
    # 상태
    status = Column(String(50), default=PayrollStatus.DRAFT.value)
    approved_by = Column(Integer, ForeignKey("employees.id"))
    approved_at = Column(Date)
    
    # 근태 데이터 연동
    attendance_hours = Column(Float)
    leave_days = Column(Float)
    
    # 통화
    currency = Column(String(10), default="KRW")
    
    # 메모
    notes = Column(Text)
    
    # 관계
    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="payrolls")
    approver = relationship("Employee", foreign_keys=[approved_by])
    items = relationship("PayrollItem", back_populates="payroll", cascade="all, delete-orphan")
    payslip = relationship("Payslip", back_populates="payroll", uselist=False)
    
    def __repr__(self):
        return f"<Payroll {self.id}: Employee {self.employee_id} - {self.pay_date}>"


class PayrollItem(BaseModel):
    """급여 항목"""
    __tablename__ = "payroll_items"
    
    payroll_id = Column(Integer, ForeignKey("payrolls.id"), nullable=False)
    
    item_type = Column(String(50), nullable=False)  # earning, deduction
    item_name = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False)
    quantity = Column(Float, default=1.0)
    rate = Column(Float)
    
    description = Column(Text)
    
    # 관계
    payroll = relationship("Payroll", back_populates="items")
    
    def __repr__(self):
        return f"<PayrollItem {self.id}: {self.item_name} - {self.amount}>"


class Payslip(BaseModel):
    """급여명세서"""
    __tablename__ = "payslips"
    
    payroll_id = Column(Integer, ForeignKey("payrolls.id"), nullable=False, unique=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    
    # 명세서 정보
    payslip_number = Column(String(100), unique=True, nullable=False)
    issued_date = Column(Date, nullable=False)
    issued_by = Column(Integer, ForeignKey("employees.id"))
    
    # 파일 경로
    pdf_path = Column(String(500))
    html_path = Column(String(500))
    
    # 배포 정보
    distributed_via = Column(String(50))  # portal, email, app
    distributed_at = Column(DateTime)
    viewed_at = Column(DateTime)
    
    # 보안
    access_token = Column(String(500))  # 명세서 접근 토큰
    expires_at = Column(DateTime)
    
    # 관계
    payroll = relationship("Payroll", back_populates="payslip")
    employee = relationship("Employee", foreign_keys=[employee_id])
    issuer = relationship("Employee", foreign_keys=[issued_by])
    
    def __repr__(self):
        return f"<Payslip {self.id}: {self.payslip_number}>"
