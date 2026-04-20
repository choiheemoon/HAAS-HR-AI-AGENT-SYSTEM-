"""인사카드/증명서 발급 이력 스키마"""
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


CertificateKind = Literal[
    "employment",
    "career",
    "salary",
    "warningLetter",
    "privacyConsent",
    "laborContract",
    "probationResult",
    "probationEvaluation",
]


class EmployeeCertificateIssueCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    certificate_kind: CertificateKind
    issue_date: date
    submit_to: Optional[str] = None
    purpose: Optional[str] = None
    remarks: Optional[str] = None
    employment_position: Optional[str] = None
    employment_duty: Optional[str] = None
    employment_salary: Optional[str] = None
    employment_benefits: Optional[str] = None
    labor_contract_witness1: Optional[str] = None
    labor_contract_witness2: Optional[str] = None
    probation_signer_name: Optional[str] = None
    payload_json: dict[str, Any] = Field(default_factory=dict)


class EmployeeCertificateIssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    company_id: Optional[int]
    issued_by_user_id: Optional[int]
    certificate_kind: str
    issue_date: date
    submit_to: Optional[str]
    purpose: Optional[str]
    remarks: Optional[str]
    employment_position: Optional[str]
    employment_duty: Optional[str]
    employment_salary: Optional[str]
    employment_benefits: Optional[str]
    labor_contract_witness1: Optional[str]
    labor_contract_witness2: Optional[str]
    probation_signer_name: Optional[str]
    payload_json: dict[str, Any]
    created_at: datetime
    employee_portal_opened_at: Optional[datetime] = None
    employee_portal_signed_at: Optional[datetime] = None
    employee_portal_acknowledged_at: Optional[datetime] = None
