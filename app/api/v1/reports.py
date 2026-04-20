"""인사리포트 API"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.services.reports import ReportService

router = APIRouter()


@router.get("/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    """대시보드 데이터 조회"""
    try:
        service = ReportService(db)
        data = service.get_dashboard_data()
        return data
    except Exception as e:
        # 오류 발생 시 기본값 반환
        import traceback
        print(f"대시보드 데이터 조회 오류: {e}")
        traceback.print_exc()
        return {
            "total_employees": 0,
            "new_hires_this_month": 0,
            "turnover_rate": 0.0,
            "average_salary": 0,
            "active_job_postings": 0
        }


@router.get("/turnover")
def get_turnover_analysis(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """이직률 분석"""
    service = ReportService(db)
    return service.get_turnover_analysis(start_date, end_date)


@router.get("/recruitment")
def get_recruitment_metrics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """채용 지표"""
    service = ReportService(db)
    return service.get_recruitment_metrics(start_date, end_date)


@router.get("/payroll-cost")
def get_payroll_cost_analysis(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """급여 비용 분석"""
    service = ReportService(db)
    return service.get_payroll_cost_analysis(start_date, end_date)


@router.get("/attendance")
def get_attendance_summary(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """근태 요약"""
    service = ReportService(db)
    return service.get_attendance_summary(start_date, end_date)


@router.get("/trends/{metric}")
def analyze_trends(
    metric: str,
    period: int = 12,
    db: Session = Depends(get_db)
):
    """트렌드 분석"""
    service = ReportService(db)
    return service.analyze_trends(metric, period)
