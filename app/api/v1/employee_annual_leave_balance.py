"""직원 연도별 연차 잔액 API."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.employee_annual_leave_balance_service import EmployeeAnnualLeaveBalanceService

router = APIRouter()


@router.get("/annual-leave-balances/list", response_model=Dict[str, Any])
@router.get("/annual-leave-balances/list/", response_model=Dict[str, Any])
@router.get("/annual-leave-balances-list", response_model=Dict[str, Any])
@router.get("/annual-leave-balances-list/", response_model=Dict[str, Any])
def list_company_annual_leave_balances(
    company_id: int | None = Query(default=None),
    leave_year: int = Query(..., ge=1900, le=9999),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: str | None = Query(None),
    department: str | None = Query(None),
    status: str = Query("active"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if company_id is not None and company_id < 1:
        raise HTTPException(status_code=400, detail="company_id는 1 이상이어야 합니다.")
    try:
        return EmployeeAnnualLeaveBalanceService(db).list_for_company_year(
            company_id=company_id,
            leave_year=leave_year,
            user=current_user,
            page=page,
            page_size=page_size,
            search=search,
            department=department,
            status=status,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{employee_id}/annual-leave-balances/{leave_year}", response_model=Dict[str, Any])
@router.get("/{employee_id}/annual-leave-balances/{leave_year}/", response_model=Dict[str, Any])
def get_employee_annual_leave_balance(
    employee_id: int,
    leave_year: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return EmployeeAnnualLeaveBalanceService(db).get_by_employee_year(employee_id, leave_year, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{employee_id}/annual-leave-balances/{leave_year}", response_model=Dict[str, Any])
@router.put("/{employee_id}/annual-leave-balances/{leave_year}/", response_model=Dict[str, Any])
def put_employee_annual_leave_balance(
    employee_id: int,
    leave_year: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return EmployeeAnnualLeaveBalanceService(db).upsert_by_employee_year(employee_id, leave_year, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)[:500]) from e


@router.post("/annual-leave-balances/{leave_year}/bulk-generate", response_model=Dict[str, Any])
@router.post("/annual-leave-balances/{leave_year}/bulk-generate/", response_model=Dict[str, Any])
def bulk_generate_annual_leave_balance(
    leave_year: int,
    body: Dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return EmployeeAnnualLeaveBalanceService(db).bulk_generate(leave_year, current_user, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
