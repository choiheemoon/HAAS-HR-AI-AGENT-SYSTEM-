"""급여근태기간 기준 근태·OT·수당 집계 API."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.attendance_payroll_bucket_service import AttendancePayrollBucketService

router = APIRouter()


class PayrollBucketComputeBody(BaseModel):
    company_id: int = Field(..., ge=1)
    calendar_year: int = Field(..., ge=2000, le=2100)
    calendar_month: int = Field(..., ge=1, le=12)
    period_label: str = Field(default="Period 1")
    coverage: str = Field(default="all")  # all | code_range | department
    employee_code_from: Optional[str] = None
    employee_code_to: Optional[str] = None
    department_code: Optional[str] = None
    income_ot_only: bool = False


class PayrollBucketCloseBody(BaseModel):
    company_id: int = Field(..., ge=1)
    calendar_year: int = Field(..., ge=2000, le=2100)
    calendar_month: int = Field(..., ge=1, le=12)
    period_label: str = Field(default="Period 1")
    is_closed: bool = Field(default=True)


@router.get("/payroll-bucket/payment-periods", response_model=Dict[str, Any])
def list_payroll_payment_periods(
    company_id: int = Query(..., ge=1),
    calendar_year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        items = AttendancePayrollBucketService(db).list_payment_periods(current_user, company_id, calendar_year)
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/payroll-bucket/close", response_model=Dict[str, Any])
def close_payroll_bucket_period(
    body: PayrollBucketCloseBody,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendancePayrollBucketService(db).set_period_closed(
            current_user,
            company_id=body.company_id,
            calendar_year=body.calendar_year,
            calendar_month=body.calendar_month,
            period_label=body.period_label,
            is_closed=bool(body.is_closed),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/payroll-bucket/compute", response_model=Dict[str, Any])
def compute_payroll_bucket(
    body: PayrollBucketComputeBody,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendancePayrollBucketService(db).compute_for_period(
            current_user,
            company_id=body.company_id,
            calendar_year=body.calendar_year,
            calendar_month=body.calendar_month,
            period_label=body.period_label,
            coverage=body.coverage,
            employee_code_from=body.employee_code_from,
            employee_code_to=body.employee_code_to,
            department_code=body.department_code,
            income_ot_only=body.income_ot_only,
            employee_ids=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/payroll-bucket/yearly-status", response_model=Dict[str, Any])
def yearly_payroll_bucket_status(
    company_id: int = Query(..., ge=1),
    employee_id: int = Query(..., ge=1),
    calendar_year: int = Query(..., ge=2000, le=2100),
    income_ot_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendancePayrollBucketService(db).yearly_status_for_employee(
            current_user,
            company_id=company_id,
            employee_id=employee_id,
            calendar_year=calendar_year,
            income_ot_only=income_ot_only,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/payroll-bucket/period-status-all", response_model=Dict[str, Any])
def period_payroll_bucket_status_all(
    company_id: Optional[int] = Query(None, ge=1),
    calendar_year: int = Query(..., ge=2000, le=2100),
    calendar_month: int = Query(..., ge=1, le=12),
    status: str = Query("active"),
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    income_ot_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendancePayrollBucketService(db).period_status_all(
            current_user,
            company_id=company_id,
            calendar_year=calendar_year,
            calendar_month=calendar_month,
            status=status,
            department=department,
            search=search,
            income_ot_only=income_ot_only,
            page=page,
            page_size=page_size,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
