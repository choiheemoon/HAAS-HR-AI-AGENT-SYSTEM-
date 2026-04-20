"""세금 계산 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.services.tax import TaxService

router = APIRouter()


@router.post("/withholding/{payroll_id}")
def calculate_withholding_tax(
    payroll_id: int,
    db: Session = Depends(get_db)
):
    """원천세 계산"""
    service = TaxService(db)
    tax_calculation = service.calculate_withholding_tax(payroll_id)
    return {
        "id": tax_calculation.id,
        "total_tax": tax_calculation.total_tax,
        "tax_items": tax_calculation.tax_items
    }


@router.post("/year-end/{employee_id}")
def calculate_year_end_tax(
    employee_id: int,
    year: int,
    db: Session = Depends(get_db)
):
    """연말정산 계산"""
    service = TaxService(db)
    tax_calculation = service.calculate_year_end_tax(employee_id, year)
    return {
        "id": tax_calculation.id,
        "total_tax": tax_calculation.total_tax,
        "tax_items": tax_calculation.tax_items
    }


@router.post("/reports/{tax_calculation_id}")
def generate_tax_report(
    tax_calculation_id: int,
    report_type: str,
    db: Session = Depends(get_db)
):
    """세금 신고서 생성"""
    service = TaxService(db)
    tax_report = service.generate_tax_report(tax_calculation_id, report_type)
    return {
        "id": tax_report.id,
        "report_number": tax_report.report_number,
        "status": tax_report.status
    }


@router.post("/reports/{tax_report_id}/submit")
def submit_tax_report(
    tax_report_id: int,
    db: Session = Depends(get_db)
):
    """세금 신고서 제출"""
    service = TaxService(db)
    tax_report = service.submit_tax_report(tax_report_id)
    return {
        "id": tax_report.id,
        "status": tax_report.status,
        "submitted_at": tax_report.submitted_at.isoformat()
    }
