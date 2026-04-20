"""급여 계산 서비스"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import date, timedelta
from app.models.payroll import Payroll, PayrollItem, PayrollStatus
from app.models.employee import Employee
from app.models.attendance import Attendance
from app.core.ai_agent import PayrollAgent, HRAIAgent
from app.services.attendance.attendance_service import AttendanceService


class PayrollService:
    """급여 계산 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
        self.base_agent = HRAIAgent()
        self.payroll_agent = PayrollAgent(self.base_agent)
        self.attendance_service = AttendanceService(db)
    
    def calculate_payroll(self, employee_id: int, period_start: date, period_end: date) -> Payroll:
        """급여 계산"""
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError("직원을 찾을 수 없습니다.")
        
        # 근태 데이터 가져오기
        attendance_data = self.attendance_service.export_to_payroll(employee_id, period_start, period_end)
        
        # 기본 급여 계산
        base_salary = employee.base_salary or 0
        
        # 근무 시간 기반 급여 계산
        work_hours = attendance_data["total_work_hours"]
        hourly_rate = base_salary / 160  # 월 160시간 기준
        work_pay = work_hours * hourly_rate
        
        # 연장 근무 수당
        overtime_hours = attendance_data["total_overtime_hours"]
        overtime_pay = overtime_hours * hourly_rate * 1.5  # 1.5배
        
        # 수당 계산 (실제로는 별도 테이블이나 설정에서 가져오기)
        allowances = {}  # employee.allowances if hasattr(employee, 'allowances') else {}
        total_allowances = sum(allowances.values()) if isinstance(allowances, dict) else 0
        
        # 총 급여
        gross_pay = base_salary + overtime_pay + total_allowances
        
        # 공제 계산
        deductions = self._calculate_deductions(gross_pay, employee)
        total_deductions = sum(deductions.values())
        
        # 실수령액
        net_pay = gross_pay - total_deductions
        
        # 급여 생성
        payroll = Payroll(
            employee_id=employee_id,
            pay_period_start=period_start,
            pay_period_end=period_end,
            pay_date=self._calculate_pay_date(period_end),
            base_salary=base_salary,
            gross_pay=gross_pay,
            net_pay=net_pay,
            overtime_pay=overtime_pay,
            allowances=allowances,
            tax_deductions=deductions,
            total_deductions=total_deductions,
            attendance_hours=work_hours,
            status=PayrollStatus.CALCULATED.value,
            currency=employee.currency or "KRW"
        )
        
        self.db.add(payroll)
        self.db.flush()
        
        # 급여 항목 생성
        self._create_payroll_items(payroll, base_salary, overtime_pay, allowances, deductions)
        
        self.db.commit()
        self.db.refresh(payroll)
        return payroll
    
    def approve_payroll(self, payroll_id: int, approver_id: int) -> Payroll:
        """급여 승인"""
        payroll = self.db.query(Payroll).filter(Payroll.id == payroll_id).first()
        if not payroll:
            raise ValueError("급여를 찾을 수 없습니다.")
        
        payroll.status = PayrollStatus.APPROVED.value
        payroll.approved_by = approver_id
        payroll.approved_at = date.today()
        
        self.db.commit()
        self.db.refresh(payroll)
        return payroll
    
    def mark_as_paid(self, payroll_id: int) -> Payroll:
        """급여 지급 완료 처리"""
        payroll = self.db.query(Payroll).filter(Payroll.id == payroll_id).first()
        if not payroll:
            raise ValueError("급여를 찾을 수 없습니다.")
        
        payroll.status = PayrollStatus.PAID.value
        
        self.db.commit()
        self.db.refresh(payroll)
        return payroll
    
    def _calculate_deductions(self, gross_pay: float, employee: Employee) -> Dict[str, float]:
        """공제 계산"""
        deductions = {}
        
        # 소득세 (간단한 계산, 실제로는 더 복잡한 로직 필요)
        income_tax_rate = 0.14  # 14%
        deductions["income_tax"] = gross_pay * income_tax_rate
        
        # 지방소득세 (소득세의 10%)
        deductions["local_tax"] = deductions["income_tax"] * 0.1
        
        # 국민연금 (4.5%)
        pension_rate = 0.045
        deductions["pension"] = gross_pay * pension_rate
        
        # 건강보험 (3.545%)
        health_insurance_rate = 0.03545
        deductions["health_insurance"] = gross_pay * health_insurance_rate
        
        # 고용보험 (0.9%)
        employment_insurance_rate = 0.009
        deductions["employment_insurance"] = gross_pay * employment_insurance_rate
        
        return deductions
    
    def _create_payroll_items(self, payroll: Payroll, base_salary: float, 
                             overtime_pay: float, allowances: Dict, deductions: Dict):
        """급여 항목 생성"""
        # 수당 항목
        if base_salary > 0:
            item = PayrollItem(
                payroll_id=payroll.id,
                item_type="earning",
                item_name="기본급",
                amount=base_salary
            )
            self.db.add(item)
        
        if overtime_pay > 0:
            item = PayrollItem(
                payroll_id=payroll.id,
                item_type="earning",
                item_name="연장근무수당",
                amount=overtime_pay
            )
            self.db.add(item)
        
        if isinstance(allowances, dict):
            for allowance_type, amount in allowances.items():
                item = PayrollItem(
                    payroll_id=payroll.id,
                    item_type="earning",
                    item_name=allowance_type,
                    amount=amount
                )
                self.db.add(item)
        
        # 공제 항목
        for deduction_type, amount in deductions.items():
            item = PayrollItem(
                payroll_id=payroll.id,
                item_type="deduction",
                item_name=deduction_type,
                amount=amount
            )
            self.db.add(item)
    
    def _calculate_pay_date(self, period_end: date) -> date:
        """지급일 계산 (보통 급여 기간 종료 후 며칠 후)"""
        return period_end + timedelta(days=5)  # 예: 5일 후
    
    def get_payroll_history(self, employee_id: int, limit: int = 12) -> List[Payroll]:
        """급여 이력 조회"""
        return self.db.query(Payroll).filter(
            Payroll.employee_id == employee_id
        ).order_by(Payroll.pay_date.desc()).limit(limit).all()
