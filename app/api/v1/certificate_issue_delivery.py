"""
증명서 발급 이력 — 직원 전달 링크 API

`/api/v1/employees/certificate-issues/...` 와 별도로
`/api/v1/certificate-issues/{issue_id}/delivery-token` 를 제공합니다.
일부 배포·리버스 프록시에서 employees 하위 POST만 404 나는 경우를 피하기 위함입니다.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.schemas.certificate_delivery import CertificateDeliveryCreateResponse
from app.services.certificate_delivery_service import CertificateDeliveryService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def create_delivery_token_response(
    issue_id: int,
    ttl_days: int,
    current_user,
    db: Session,
) -> CertificateDeliveryCreateResponse:
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    svc = CertificateDeliveryService(db)
    try:
        raw, tok = svc.create_delivery_token(issue_id, allowed_company_ids, ttl_days=ttl_days)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    fe = (settings.FRONTEND_URL or "").strip().rstrip("/")
    path = f"/certificate-delivery?token={raw}"
    delivery_url = f"{fe}{path}" if fe else path
    return CertificateDeliveryCreateResponse(token=raw, expires_at=tok.expires_at, delivery_url=delivery_url)


@router.post("/{issue_id}/delivery-token", response_model=CertificateDeliveryCreateResponse)
@router.post("/{issue_id}/delivery-token/", response_model=CertificateDeliveryCreateResponse)
def post_certificate_issue_delivery_token(
    issue_id: int,
    ttl_days: int = 30,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """직원 전달용 비밀 링크 발급(토큰은 응답 시 한 번만 노출)."""
    return create_delivery_token_response(issue_id, ttl_days, current_user, db)


@router.post("/{issue_id}/delivery", response_model=CertificateDeliveryCreateResponse)
@router.post("/{issue_id}/delivery/", response_model=CertificateDeliveryCreateResponse)
def post_certificate_issue_delivery_short_alias(
    issue_id: int,
    ttl_days: int = 30,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`/delivery-token` 과 동일(짧은 경로 별칭)."""
    return create_delivery_token_response(issue_id, ttl_days, current_user, db)
