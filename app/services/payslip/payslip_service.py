"""급여명세서 서비스"""
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import date, datetime, timedelta
import secrets
from app.models.payroll import Payslip
from app.models.payroll import Payroll
from app.utils.pdf_generator import generate_payslip_pdf
from app.utils.email_sender import send_email


class PayslipService:
    """급여명세서 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_payslip(self, payroll_id: int, issued_by: int) -> Payslip:
        """급여명세서 생성"""
        payroll = self.db.query(Payroll).filter(Payroll.id == payroll_id).first()
        if not payroll:
            raise ValueError("급여를 찾을 수 없습니다.")
        
        # 이미 명세서가 있는지 확인
        existing = self.db.query(Payslip).filter(Payslip.payroll_id == payroll_id).first()
        if existing:
            return existing
        
        # 명세서 번호 생성
        payslip_number = f"PS-{payroll.employee_id}-{payroll.pay_date.strftime('%Y%m')}-{payroll.id}"
        
        # PDF 생성
        pdf_path = generate_payslip_pdf(payroll, payslip_number)
        
        # 접근 토큰 생성
        access_token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(days=365)  # 1년 유효
        
        # 명세서 생성
        payslip = Payslip(
            payroll_id=payroll_id,
            employee_id=payroll.employee_id,
            payslip_number=payslip_number,
            issued_date=date.today(),
            issued_by=issued_by,
            pdf_path=pdf_path,
            access_token=access_token,
            expires_at=expires_at
        )
        
        self.db.add(payslip)
        self.db.commit()
        self.db.refresh(payslip)
        
        # 자동 배포
        self.distribute_payslip(payslip.id)
        
        return payslip
    
    def distribute_payslip(self, payslip_id: int, distribution_method: str = "portal") -> Payslip:
        """급여명세서 배포"""
        payslip = self.db.query(Payslip).filter(Payslip.id == payslip_id).first()
        if not payslip:
            raise ValueError("급여명세서를 찾을 수 없습니다.")
        
        payslip.distributed_via = distribution_method
        payslip.distributed_at = datetime.now()
        
        # 이메일 배포
        if distribution_method == "email":
            self._send_payslip_email(payslip)
        
        self.db.commit()
        self.db.refresh(payslip)
        return payslip
    
    def get_payslip(self, payslip_id: int, access_token: Optional[str] = None) -> Optional[Payslip]:
        """급여명세서 조회"""
        payslip = self.db.query(Payslip).filter(Payslip.id == payslip_id).first()
        
        if not payslip:
            return None
        
        # 접근 토큰 확인
        if access_token and payslip.access_token != access_token:
            raise ValueError("유효하지 않은 접근 토큰입니다.")
        
        # 만료 확인
        if payslip.expires_at and payslip.expires_at < datetime.now():
            raise ValueError("만료된 명세서입니다.")
        
        # 조회 시간 기록
        if not payslip.viewed_at:
            payslip.viewed_at = datetime.now()
            self.db.commit()
        
        return payslip
    
    def get_employee_payslips(self, employee_id: int, limit: int = 12) -> list[Payslip]:
        """직원의 급여명세서 목록 조회"""
        return self.db.query(Payslip).filter(
            Payslip.employee_id == employee_id
        ).order_by(Payslip.issued_date.desc()).limit(limit).all()
    
    def _send_payslip_email(self, payslip: Payslip):
        """이메일로 명세서 발송"""
        payroll = payslip.payroll
        employee = payroll.employee
        
        subject = f"급여명세서 - {payslip.issued_date.strftime('%Y년 %m월')}"
        body = f"""
        {employee.name}님,
        
        {payslip.issued_date.strftime('%Y년 %m월')} 급여명세서가 발급되었습니다.
        
        명세서 번호: {payslip.payslip_number}
        총 급여: {payroll.gross_pay:,.0f}원
        실수령액: {payroll.net_pay:,.0f}원
        
        포털에서 확인하실 수 있습니다.
        """
        
        # 실제로는 send_email 함수 사용
        # send_email(employee.email, subject, body, attachment=payslip.pdf_path)
