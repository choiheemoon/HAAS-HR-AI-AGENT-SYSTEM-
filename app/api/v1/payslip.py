"""급여명세서 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.services.payslip import PayslipService

router = APIRouter()


@router.post("/generate/{payroll_id}")
def generate_payslip(
    payroll_id: int,
    issued_by: int,
    db: Session = Depends(get_db)
):
    """급여명세서 생성"""
    service = PayslipService(db)
    payslip = service.generate_payslip(payroll_id, issued_by)
    return {
        "id": payslip.id,
        "payslip_number": payslip.payslip_number,
        "issued_date": payslip.issued_date.isoformat()
    }


@router.get("/{payslip_id}")
def get_payslip(
    payslip_id: int,
    access_token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """급여명세서 조회"""
    service = PayslipService(db)
    payslip = service.get_payslip(payslip_id, access_token)
    if not payslip:
        raise HTTPException(status_code=404, detail="급여명세서를 찾을 수 없습니다.")
    return {
        "id": payslip.id,
        "payslip_number": payslip.payslip_number,
        "pdf_path": payslip.pdf_path
    }


@router.get("/employee/{employee_id}")
def get_employee_payslips(
    employee_id: int,
    limit: int = 12,
    db: Session = Depends(get_db)
):
    """직원의 급여명세서 목록 조회"""
    service = PayslipService(db)
    payslips = service.get_employee_payslips(employee_id, limit)
    return [
        {
            "id": p.id,
            "payslip_number": p.payslip_number,
            "issued_date": p.issued_date.isoformat()
        }
        for p in payslips
    ]
