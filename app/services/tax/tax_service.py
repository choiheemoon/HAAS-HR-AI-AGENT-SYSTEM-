"""세금 계산 서비스"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import date
from app.models.tax import TaxCalculation, TaxReport
from app.models.payroll import Payroll
from app.models.employee import Employee
from app.core.ai_agent import PayrollAgent, HRAIAgent


class TaxService:
    """세금 계산 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
        self.base_agent = HRAIAgent()
        self.payroll_agent = PayrollAgent(self.base_agent)
    
    def calculate_withholding_tax(self, payroll_id: int) -> TaxCalculation:
        """원천세 계산"""
        payroll = self.db.query(Payroll).filter(Payroll.id == payroll_id).first()
        if not payroll:
            raise ValueError("급여를 찾을 수 없습니다.")
        
        employee = payroll.employee
        
        # 이미 계산된 세금이 있는지 확인
        existing = self.db.query(TaxCalculation).filter(
            TaxCalculation.payroll_id == payroll_id
        ).first()
        
        if existing:
            return existing
        
        # 소득세 계산
        taxable_income = payroll.gross_pay
        tax_items = {}
        
        # 소득세 (간단한 계산, 실제로는 더 복잡한 로직 필요)
        income_tax = self._calculate_income_tax(taxable_income, employee)
        tax_items["income_tax"] = {
            "amount": income_tax,
            "rate": 0.14,
            "base": taxable_income
        }
        
        # 지방소득세 (소득세의 10%)
        local_tax = income_tax * 0.1
        tax_items["local_tax"] = {
            "amount": local_tax,
            "rate": 0.1,
            "base": income_tax
        }
        
        # 4대보험 계산
        social_insurance = self._calculate_social_insurance(payroll.gross_pay)
        tax_items.update(social_insurance)
        
        total_tax = income_tax + local_tax + sum(
            item["amount"] for item in social_insurance.values()
        )
        
        # 세금 계산 생성
        tax_calculation = TaxCalculation(
            employee_id=employee.id,
            payroll_id=payroll_id,
            calculation_period="monthly",
            period_start=payroll.pay_period_start,
            period_end=payroll.pay_period_end,
            gross_income=payroll.gross_pay,
            taxable_income=taxable_income,
            tax_items=tax_items,
            total_tax=total_tax,
            deductions=self._calculate_deductions(employee),
            region="KR",
            currency=payroll.currency,
            status="calculated"
        )
        
        self.db.add(tax_calculation)
        self.db.commit()
        self.db.refresh(tax_calculation)
        
        return tax_calculation
    
    def calculate_year_end_tax(self, employee_id: int, year: int) -> TaxCalculation:
        """연말정산 계산"""
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        
        # 해당 연도의 모든 급여 조회
        payrolls = self.db.query(Payroll).filter(
            Payroll.employee_id == employee_id,
            Payroll.pay_period_start >= year_start,
            Payroll.pay_period_end <= year_end,
            Payroll.status == "paid"
        ).all()
        
        if not payrolls:
            raise ValueError("해당 연도의 급여 정보가 없습니다.")
        
        # 연간 총 소득
        total_gross_income = sum(p.gross_pay for p in payrolls)
        
        # 연간 총 세금
        total_tax_paid = sum(
            sum(p.tax_deductions.values()) if isinstance(p.tax_deductions, dict) else 0
            for p in payrolls
        )
        
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        
        # 연말정산 계산
        year_end_tax = self._calculate_year_end_tax_adjustment(
            total_gross_income, total_tax_paid, employee, year
        )
        
        # 세금 계산 생성
        tax_calculation = TaxCalculation(
            employee_id=employee_id,
            calculation_period="yearly",
            period_start=year_start,
            period_end=year_end,
            gross_income=total_gross_income,
            taxable_income=total_gross_income,
            tax_items=year_end_tax["tax_items"],
            total_tax=year_end_tax["total_tax"],
            deductions=year_end_tax["deductions"],
            region="KR",
            currency="KRW",
            status="calculated"
        )
        
        self.db.add(tax_calculation)
        self.db.commit()
        self.db.refresh(tax_calculation)
        
        return tax_calculation
    
    def generate_tax_report(self, tax_calculation_id: int, report_type: str) -> TaxReport:
        """세금 신고서 생성"""
        tax_calculation = self.db.query(TaxCalculation).filter(
            TaxCalculation.id == tax_calculation_id
        ).first()
        
        if not tax_calculation:
            raise ValueError("세금 계산을 찾을 수 없습니다.")
        
        # 신고서 번호 생성
        report_number = f"TR-{tax_calculation.employee_id}-{tax_calculation.period_start.strftime('%Y%m')}-{tax_calculation.id}"
        
        # 신고서 데이터 생성
        report_data = {
            "employee_id": tax_calculation.employee_id,
            "period": f"{tax_calculation.period_start} ~ {tax_calculation.period_end}",
            "gross_income": tax_calculation.gross_income,
            "taxable_income": tax_calculation.taxable_income,
            "tax_items": tax_calculation.tax_items,
            "total_tax": tax_calculation.total_tax
        }
        
        # 신고서 생성
        tax_report = TaxReport(
            tax_calculation_id=tax_calculation_id,
            report_type=report_type,
            report_number=report_number,
            report_date=date.today(),
            reporting_authority="국세청",
            report_data=report_data,
            status="draft"
        )
        
        self.db.add(tax_report)
        self.db.commit()
        self.db.refresh(tax_report)
        
        return tax_report
    
    def submit_tax_report(self, tax_report_id: int) -> TaxReport:
        """세금 신고서 제출"""
        tax_report = self.db.query(TaxReport).filter(TaxReport.id == tax_report_id).first()
        if not tax_report:
            raise ValueError("세금 신고서를 찾을 수 없습니다.")
        
        # 실제로는 국세청 API를 호출하여 제출
        # self._submit_to_tax_authority(tax_report)
        
        tax_report.status = "submitted"
        tax_report.submitted_at = date.today()
        
        self.db.commit()
        self.db.refresh(tax_report)
        return tax_report
    
    def _calculate_income_tax(self, taxable_income: float, employee: Employee) -> float:
        """소득세 계산 (간단한 버전)"""
        # 실제로는 더 복잡한 세율표 적용 필요
        if taxable_income <= 12000000:
            return taxable_income * 0.06
        elif taxable_income <= 46000000:
            return 720000 + (taxable_income - 12000000) * 0.15
        elif taxable_income <= 88000000:
            return 5820000 + (taxable_income - 46000000) * 0.24
        else:
            return 15900000 + (taxable_income - 88000000) * 0.35
    
    def _calculate_social_insurance(self, gross_pay: float) -> Dict[str, Dict[str, float]]:
        """4대보험 계산"""
        return {
            "pension": {
                "amount": gross_pay * 0.045,
                "rate": 0.045,
                "base": gross_pay
            },
            "health_insurance": {
                "amount": gross_pay * 0.03545,
                "rate": 0.03545,
                "base": gross_pay
            },
            "employment_insurance": {
                "amount": gross_pay * 0.009,
                "rate": 0.009,
                "base": gross_pay
            }
        }
    
    def _calculate_deductions(self, employee: Employee) -> Dict[str, Any]:
        """공제 항목 계산"""
        deductions = {
            "basic_deduction": 1500000,  # 기본공제
            "dependents": employee.dependents * 1500000,  # 부양가족 공제
        }
        
        if employee.tax_exemptions:
            deductions.update(employee.tax_exemptions)
        
        return deductions
    
    def _calculate_year_end_tax_adjustment(self, total_income: float, total_tax_paid: float,
                                           employee: Employee, year: int) -> Dict[str, Any]:
        """연말정산 계산"""
        # 연간 소득세 재계산
        annual_tax = self._calculate_income_tax(total_income, employee)
        
        # 공제 적용
        deductions = self._calculate_deductions(employee)
        total_deductions = sum(deductions.values())
        adjusted_taxable_income = max(0, total_income - total_deductions)
        adjusted_tax = self._calculate_income_tax(adjusted_taxable_income, employee)
        
        # 환급 또는 추가 납부
        tax_difference = adjusted_tax - total_tax_paid
        
        return {
            "tax_items": {
                "annual_income_tax": adjusted_tax,
                "tax_paid": total_tax_paid,
                "tax_difference": tax_difference
            },
            "total_tax": adjusted_tax,
            "deductions": deductions,
            "refund_or_payment": tax_difference
        }
