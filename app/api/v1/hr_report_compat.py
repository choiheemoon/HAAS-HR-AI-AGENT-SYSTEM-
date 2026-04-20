"""인사레포트 집계 — 레거시·단축 URL 호환 (/employee_summary)."""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.employee_hr_analytics_service import build_hr_analytics_summary
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


@router.get("/employee_summary", response_model=Dict[str, Any])
@router.get("/employee_summary/", response_model=Dict[str, Any])
def get_employee_summary_compat(
    company_id: Optional[int] = None,
    months: int = 12,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GET /api/v1/employee_summary — canonical과 동일 (GET /api/v1/employees/hr-analytics/summary)."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return build_hr_analytics_summary(db, [], company_id, months)
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    return build_hr_analytics_summary(db, allowed_company_ids, company_id, months)
