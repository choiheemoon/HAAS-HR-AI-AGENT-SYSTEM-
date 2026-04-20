"""증명서 직원 전달 — 인증 없이 토큰으로만 접근(1단계)"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas.certificate_delivery import (
    CertificateDeliveryAckBody,
    CertificateDeliveryActionResponse,
    CertificateDeliveryPublicView,
    CertificateDeliverySignBody,
)
from app.services.certificate_delivery_service import (
    CertificateDeliveryService,
    certificate_kind_requires_employee_signature,
)
from app.services.employee_photo_storage import absolute_file_path, media_type_for_path
from app.services.master_data import MasterDataService

router = APIRouter()


def _client_ip(request: Request) -> Optional[str]:
    if request.client:
        return request.client.host
    return None


def _ua(request: Request) -> Optional[str]:
    h = request.headers.get("user-agent")
    return h[:512] if h else None


@router.get(
    "/certificate-deliveries/{token}",
    response_model=CertificateDeliveryPublicView,
)
@router.get(
    "/certificate-deliveries/{token}/",
    response_model=CertificateDeliveryPublicView,
)
def get_certificate_delivery_public(token: str, request: Request, db: Session = Depends(get_db)):
    svc = CertificateDeliveryService(db)
    svc.mark_opened(token)
    pair = svc.get_public_view(token)
    if not pair:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않거나 만료되었습니다.")
    tok, issue = pair
    req_sig = certificate_kind_requires_employee_signature(issue.certificate_kind)
    opened = tok.opened_at is not None
    signed = issue.employee_portal_signed_at is not None
    acknowledged = issue.employee_portal_acknowledged_at is not None
    return CertificateDeliveryPublicView(
        issue_id=issue.id,
        certificate_kind=issue.certificate_kind,
        requires_employee_signature=req_sig,
        issue_date=issue.issue_date,
        expires_at=tok.expires_at,
        opened=opened,
        signed=signed,
        acknowledged=acknowledged,
        can_submit_signature=req_sig and not signed,
        can_acknowledge=(not req_sig) and not acknowledged,
        payload_json=issue.payload_json if isinstance(issue.payload_json, dict) else {},
        employee_id=issue.employee_id,
    )


@router.post(
    "/certificate-deliveries/{token}/sign",
    response_model=CertificateDeliveryActionResponse,
)
@router.post(
    "/certificate-deliveries/{token}/sign/",
    response_model=CertificateDeliveryActionResponse,
)
def post_certificate_delivery_sign(
    token: str,
    body: CertificateDeliverySignBody,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = CertificateDeliveryService(db)
    try:
        svc.sign(token, body.signature_png_data_url, _client_ip(request), _ua(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    pair = svc.get_public_view(token)
    if not pair:
        raise HTTPException(status_code=404, detail="발급 이력을 찾을 수 없습니다.")
    _, issue = pair
    return CertificateDeliveryActionResponse(
        ok=True,
        employee_portal_signed_at=issue.employee_portal_signed_at,
    )


@router.post(
    "/certificate-deliveries/{token}/acknowledge",
    response_model=CertificateDeliveryActionResponse,
)
@router.post(
    "/certificate-deliveries/{token}/acknowledge/",
    response_model=CertificateDeliveryActionResponse,
)
def post_certificate_delivery_acknowledge(
    token: str,
    _body: CertificateDeliveryAckBody,
    request: Request,
    db: Session = Depends(get_db),
):
    svc = CertificateDeliveryService(db)
    try:
        svc.acknowledge(token, _client_ip(request), _ua(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    pair = svc.get_public_view(token)
    if not pair:
        raise HTTPException(status_code=404, detail="발급 이력을 찾을 수 없습니다.")
    _, issue = pair
    return CertificateDeliveryActionResponse(
        ok=True,
        employee_portal_acknowledged_at=issue.employee_portal_acknowledged_at,
    )


@router.get("/certificate-deliveries/{token}/photo")
@router.get("/certificate-deliveries/{token}/photo/")
def get_certificate_delivery_photo(token: str, db: Session = Depends(get_db)):
    svc = CertificateDeliveryService(db)
    pair = svc.get_public_view(token)
    if not pair:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않거나 만료되었습니다.")
    _, issue = pair
    mds = MasterDataService(db)
    emp = mds.get_employee(issue.employee_id)
    if not emp or not emp.photo_path:
        raise HTTPException(status_code=404, detail="등록된 사진이 없습니다.")
    storage = settings.STORAGE_PATH or "./storage"
    path = absolute_file_path(storage, emp.photo_path)
    if path is None:
        raise HTTPException(status_code=404, detail="사진 파일을 찾을 수 없습니다.")
    return FileResponse(str(path), media_type=media_type_for_path(emp.photo_path))
