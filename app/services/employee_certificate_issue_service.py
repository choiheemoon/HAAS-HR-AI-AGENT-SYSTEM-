"""인사카드/증명서 발급 이력 서비스"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_certificate_issue import EmployeeCertificateIssue


class EmployeeCertificateIssueService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def create(self, employee_id: int, user_id: Optional[int], data: Dict[str, Any]) -> EmployeeCertificateIssue:
        emp = self._get_employee_or_raise(employee_id)
        row = EmployeeCertificateIssue(
            employee_id=employee_id,
            company_id=emp.company_id,
            issued_by_user_id=user_id,
            certificate_kind=str(data.get("certificate_kind") or "").strip(),
            issue_date=data.get("issue_date"),
            submit_to=data.get("submit_to"),
            purpose=data.get("purpose"),
            remarks=data.get("remarks"),
            employment_position=data.get("employment_position"),
            employment_duty=data.get("employment_duty"),
            employment_salary=data.get("employment_salary"),
            employment_benefits=data.get("employment_benefits"),
            labor_contract_witness1=data.get("labor_contract_witness1"),
            labor_contract_witness2=data.get("labor_contract_witness2"),
            probation_signer_name=data.get("probation_signer_name"),
            payload_json=data.get("payload_json") or {},
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def list_by_employee(self, employee_id: int) -> List[EmployeeCertificateIssue]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeeCertificateIssue)
            .filter(EmployeeCertificateIssue.employee_id == employee_id)
            .order_by(EmployeeCertificateIssue.id.desc())
            .all()
        )

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
        employee_id: Optional[int] = None,
        certificate_kind: Optional[str] = None,
    ) -> List[EmployeeCertificateIssue]:
        if not allowed_company_ids:
            return []
        q = self.db.query(EmployeeCertificateIssue).filter(
            EmployeeCertificateIssue.company_id.in_(allowed_company_ids)
        )
        if company_id is not None:
            q = q.filter(EmployeeCertificateIssue.company_id == company_id)
        if employee_id is not None:
            q = q.filter(EmployeeCertificateIssue.employee_id == employee_id)
        if certificate_kind is not None and str(certificate_kind).strip():
            q = q.filter(EmployeeCertificateIssue.certificate_kind == str(certificate_kind).strip())
        return q.order_by(EmployeeCertificateIssue.id.desc()).all()

    def get_for_access_scope(
        self, issue_id: int, allowed_company_ids: List[int]
    ) -> Optional[EmployeeCertificateIssue]:
        if not allowed_company_ids:
            return None
        return (
            self.db.query(EmployeeCertificateIssue)
            .filter(
                EmployeeCertificateIssue.id == issue_id,
                EmployeeCertificateIssue.company_id.in_(allowed_company_ids),
            )
            .first()
        )
