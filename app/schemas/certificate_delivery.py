"""증명서 직원 전달(공개 링크) 스키마"""
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class CertificateDeliveryCreateResponse(BaseModel):
    """관리자: 전달 링크 생성 결과(평문 토큰은 이때만 반환)"""

    token: str = Field(..., description="직원에게 전달할 비밀 토큰(재조회 불가)")
    expires_at: datetime
    delivery_url: str = Field(
        ...,
        description="직원이 열 URL(FRONTEND_URL 설정 시 절대 경로, 없으면 상대 경로 예시)",
    )


class CertificateDeliveryPublicView(BaseModel):
    """직원: 토큰으로 본문 로드(인증 없음)"""

    model_config = ConfigDict(from_attributes=True)

    issue_id: int
    certificate_kind: str
    requires_employee_signature: bool
    issue_date: date
    expires_at: datetime
    opened: bool
    signed: bool
    acknowledged: bool
    can_submit_signature: bool
    can_acknowledge: bool
    payload_json: dict[str, Any]
    employee_id: int


class CertificateDeliverySignBody(BaseModel):
    signature_png_data_url: str = Field(
        ...,
        min_length=50,
        description="data:image/png;base64,... 형태의 PNG 데이터 URL",
    )


class CertificateDeliveryAckBody(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CertificateDeliveryActionResponse(BaseModel):
    ok: bool = True
    employee_portal_signed_at: Optional[datetime] = None
    employee_portal_acknowledged_at: Optional[datetime] = None
