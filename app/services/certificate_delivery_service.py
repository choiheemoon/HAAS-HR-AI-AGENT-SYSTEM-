"""증명서 직원 전달 토큰 발급·검증·서명 반영"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.employee_certificate_delivery_token import EmployeeCertificateDeliveryToken
from app.models.employee_certificate_issue import EmployeeCertificateIssue


def certificate_kind_requires_employee_signature(kind: str) -> bool:
    """수습기간평가 결과 통지(probationResult)는 전달·확인만, 나머지는 직원 서명 필요(1단계 정책)."""
    return (kind or "").strip() != "probationResult"


def _token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _merge_employee_signature_into_payload(
    payload: Any, signature_data_url: str, signed_at_naive: datetime
) -> Dict[str, Any]:
    base: Dict[str, Any] = dict(payload) if isinstance(payload, dict) else {}
    cert = base.get("certificate")
    if not isinstance(cert, dict):
        cert = {}
    cert = dict(cert)
    cert["employeeSignatureDataUrl"] = signature_data_url
    cert["employeeSignatureSignedAt"] = signed_at_naive.isoformat(timespec="seconds")
    base["certificate"] = cert
    return base


class CertificateDeliveryService:
    def __init__(self, db: Session):
        self.db = db

    def create_delivery_token(
        self,
        issue_id: int,
        allowed_company_ids: list[int],
        ttl_days: int = 30,
    ) -> Tuple[str, EmployeeCertificateDeliveryToken]:
        if not allowed_company_ids:
            raise PermissionError("권한이 없습니다.")
        ttl_days = max(1, min(int(ttl_days or 30), 365))
        row = (
            self.db.query(EmployeeCertificateIssue)
            .filter(
                EmployeeCertificateIssue.id == issue_id,
                EmployeeCertificateIssue.company_id.in_(allowed_company_ids),
            )
            .first()
        )
        if not row:
            raise ValueError("발급 이력을 찾을 수 없습니다.")

        now = _utcnow()
        for t in (
            self.db.query(EmployeeCertificateDeliveryToken)
            .filter(
                EmployeeCertificateDeliveryToken.issue_id == issue_id,
                EmployeeCertificateDeliveryToken.revoked_at.is_(None),
            )
            .all()
        ):
            t.revoked_at = now.replace(tzinfo=None)
            self.db.add(t)

        raw = secrets.token_urlsafe(32)
        th = _token_hash(raw)
        exp = now + timedelta(days=ttl_days)
        tok = EmployeeCertificateDeliveryToken(
            issue_id=issue_id,
            token_hash=th,
            expires_at=exp.replace(tzinfo=None),
        )
        self.db.add(tok)
        self.db.commit()
        self.db.refresh(tok)
        return raw, tok

    def _get_valid_token_row(self, raw_token: str) -> Optional[EmployeeCertificateDeliveryToken]:
        if not raw_token or len(raw_token) < 16:
            return None
        th = _token_hash(raw_token.strip())
        row = (
            self.db.query(EmployeeCertificateDeliveryToken)
            .filter(EmployeeCertificateDeliveryToken.token_hash == th)
            .first()
        )
        if not row:
            return None
        now = _utcnow().replace(tzinfo=None)
        if row.revoked_at is not None:
            return None
        if row.expires_at <= now:
            return None
        return row

    def get_public_view(self, raw_token: str) -> Optional[Tuple[EmployeeCertificateDeliveryToken, EmployeeCertificateIssue]]:
        tok = self._get_valid_token_row(raw_token)
        if not tok:
            return None
        issue = (
            self.db.query(EmployeeCertificateIssue)
            .filter(EmployeeCertificateIssue.id == tok.issue_id)
            .first()
        )
        if not issue:
            return None
        return tok, issue

    def mark_opened(self, raw_token: str) -> bool:
        pair = self.get_public_view(raw_token)
        if not pair:
            return False
        tok, issue = pair
        now = _utcnow().replace(tzinfo=None)
        if tok.opened_at is None:
            tok.opened_at = now
            self.db.add(tok)
        if issue.employee_portal_opened_at is None:
            issue.employee_portal_opened_at = now
            self.db.add(issue)
        self.db.commit()
        return True

    def sign(self, raw_token: str, signature_png_data_url: str, client_ip: Optional[str], user_agent: Optional[str]):
        pair = self.get_public_view(raw_token)
        if not pair:
            raise ValueError("유효하지 않거나 만료된 링크입니다.")
        tok, issue = pair
        if not certificate_kind_requires_employee_signature(issue.certificate_kind):
            raise ValueError("이 증명서 유형은 서명이 필요하지 않습니다. 수령 확인만 가능합니다.")
        if tok.signed_at is not None or issue.employee_portal_signed_at is not None:
            raise ValueError("이미 서명이 완료되었습니다.")
        sig = (signature_png_data_url or "").strip()
        if not sig.startswith("data:image/png;base64,"):
            raise ValueError("서명은 PNG 데이터 URL 형식이어야 합니다.")
        if len(sig) > 2_500_000:
            raise ValueError("서명 이미지가 너무 큽니다.")

        now = _utcnow().replace(tzinfo=None)
        issue.payload_json = _merge_employee_signature_into_payload(issue.payload_json, sig, now)
        flag_modified(issue, "payload_json")
        issue.employee_portal_signed_at = now
        tok.signed_at = now
        tok.signer_ip = (client_ip or "")[:45] or None
        tok.signer_user_agent = (user_agent or "")[:512] or None
        self.db.add(issue)
        self.db.add(tok)
        self.db.commit()

    def acknowledge(self, raw_token: str, client_ip: Optional[str], user_agent: Optional[str]):
        pair = self.get_public_view(raw_token)
        if not pair:
            raise ValueError("유효하지 않거나 만료된 링크입니다.")
        tok, issue = pair
        if certificate_kind_requires_employee_signature(issue.certificate_kind):
            raise ValueError("이 증명서는 직원 서명이 필요합니다.")
        if tok.acknowledged_at is not None or issue.employee_portal_acknowledged_at is not None:
            raise ValueError("이미 수령 확인이 완료되었습니다.")

        now = _utcnow().replace(tzinfo=None)
        issue.employee_portal_acknowledged_at = now
        tok.acknowledged_at = now
        tok.signer_ip = (client_ip or "")[:45] or None
        tok.signer_user_agent = (user_agent or "")[:512] or None
        self.db.add(issue)
        self.db.add(tok)
        self.db.commit()
