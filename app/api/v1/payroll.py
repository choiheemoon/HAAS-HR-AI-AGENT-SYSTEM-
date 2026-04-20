"""급여 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.services.payroll import PayrollService

router = APIRouter()


@router.post("/calculate")
def calculate_payroll(
    employee_id: int,
    period_start: date,
    period_end: date,
    db: Session = Depends(get_db)
):
    """급여 계산"""
    service = PayrollService(db)
    payroll = service.calculate_payroll(employee_id, period_start, period_end)
    return {
        "id": payroll.id,
        "gross_pay": payroll.gross_pay,
        "net_pay": payroll.net_pay,
        "status": payroll.status
    }


@router.post("/{payroll_id}/approve")
def approve_payroll(
    payroll_id: int,
    approver_id: int,
    db: Session = Depends(get_db)
):
    """급여 승인"""
    service = PayrollService(db)
    payroll = service.approve_payroll(payroll_id, approver_id)
    return {"id": payroll.id, "status": payroll.status}


@router.post("/{payroll_id}/mark-paid")
def mark_as_paid(
    payroll_id: int,
    db: Session = Depends(get_db)
):
    """급여 지급 완료 처리"""
    service = PayrollService(db)
    payroll = service.mark_as_paid(payroll_id)
    return {"id": payroll.id, "status": payroll.status}


@router.get("/history/{employee_id}")
def get_payroll_history(
    employee_id: int,
    limit: int = 12,
    db: Session = Depends(get_db)
):
    """급여 이력 조회"""
    service = PayrollService(db)
    payrolls = service.get_payroll_history(employee_id, limit)
    return [
        {
            "id": p.id,
            "pay_date": p.pay_date.isoformat(),
            "gross_pay": p.gross_pay,
            "net_pay": p.net_pay,
            "status": p.status
        }
        for p in payrolls
    ]
