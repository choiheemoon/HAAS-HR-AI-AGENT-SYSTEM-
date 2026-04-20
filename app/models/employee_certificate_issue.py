"""인사카드/증명서 발급 이력"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeCertificateIssue(BaseModel):
    __tablename__ = "employee_certificate_issues"

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    issued_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    certificate_kind = Column(String(50), nullable=False, index=True)
    issue_date = Column(Date, nullable=False)

    submit_to = Column(String(300), nullable=True)
    purpose = Column(String(300), nullable=True)
    remarks = Column(String(1000), nullable=True)
    employment_position = Column(String(200), nullable=True)
    employment_duty = Column(Text, nullable=True)
    employment_salary = Column(String(200), nullable=True)
    employment_benefits = Column(String(300), nullable=True)
    labor_contract_witness1 = Column(String(200), nullable=True)
    labor_contract_witness2 = Column(String(200), nullable=True)
    probation_signer_name = Column(String(200), nullable=True)

    # 증명서 재출력을 위해 당시 화면 데이터를 스냅샷 저장
    payload_json = Column(JSON, nullable=True)

    # 직원 전달 링크(1단계): 열람·서명·수령 확인 시각(목록 표시용)
    employee_portal_opened_at = Column(DateTime, nullable=True)
    employee_portal_signed_at = Column(DateTime, nullable=True)
    employee_portal_acknowledged_at = Column(DateTime, nullable=True)

    employee = relationship("Employee")
    company = relationship("Company")
    issued_by_user = relationship("User")
    delivery_tokens = relationship(
        "EmployeeCertificateDeliveryToken",
        back_populates="issue",
    )

    def __repr__(self):
        return f"<EmployeeCertificateIssue id={self.id} emp={self.employee_id} kind={self.certificate_kind}>"
