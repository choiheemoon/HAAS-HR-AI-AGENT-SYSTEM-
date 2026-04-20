"""세금 계산 모델"""
import enum
from sqlalchemy import Column, String, Date, Integer, Float, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import date


class TaxType(enum.Enum):
    """세금 타입"""
    INCOME_TAX = "income_tax"  # 소득세
    LOCAL_TAX = "local_tax"  # 지방소득세
    SOCIAL_INSURANCE = "social_insurance"  # 사회보험
    HEALTH_INSURANCE = "health_insurance"  # 건강보험
    PENSION = "pension"  # 국민연금
    EMPLOYMENT_INSURANCE = "employment_insurance"  # 고용보험


class TaxCalculation(BaseModel):
    """세금 계산"""
    __tablename__ = "tax_calculations"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    payroll_id = Column(Integer, ForeignKey("payrolls.id"), nullable=True)
    
    # 계산 기간
    calculation_period = Column(String(50))  # monthly, yearly
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    
    # 소득 정보
    gross_income = Column(Float, nullable=False)
    taxable_income = Column(Float, nullable=False)
    
    # 세금 계산 결과
    tax_items = Column(JSON)  # {tax_type: {amount, rate, etc.}}
    total_tax = Column(Float, default=0.0)
    
    # 공제 항목
    deductions = Column(JSON)  # 공제 내역
    exemptions = Column(JSON)  # 비과세 항목
    
    # 지역 정보
    region = Column(String(100), default="KR")
    currency = Column(String(10), default="KRW")
    
    # 상태
    status = Column(String(50))  # calculated, reported, paid
    reported_at = Column(Date)
    paid_at = Column(Date)
    
    # 관계
    employee = relationship("Employee")
    payroll = relationship("Payroll")
    reports = relationship("TaxReport", back_populates="tax_calculation")
    
    def __repr__(self):
        return f"<TaxCalculation {self.id}: Employee {self.employee_id} - {self.period_start}>"


class TaxReport(BaseModel):
    """세금 신고서"""
    __tablename__ = "tax_reports"
    
    tax_calculation_id = Column(Integer, ForeignKey("tax_calculations.id"), nullable=False)
    
    # 신고서 정보
    report_type = Column(String(50))  # withholding, year_end, annual
    report_number = Column(String(100), unique=True)
    report_date = Column(Date, nullable=False)
    
    # 신고 대상
    reporting_authority = Column(String(200))  # 국세청, 지방세청 등
    submission_deadline = Column(Date)
    submitted_at = Column(Date)
    
    # 신고 내용
    report_data = Column(JSON)  # 신고서 데이터
    file_path = Column(String(500))  # 신고서 파일 경로
    
    # 상태
    status = Column(String(50))  # draft, submitted, confirmed, rejected
    
    # 관계
    tax_calculation = relationship("TaxCalculation", back_populates="reports")
    
    def __repr__(self):
        return f"<TaxReport {self.id}: {self.report_type} - {self.report_date}>"
