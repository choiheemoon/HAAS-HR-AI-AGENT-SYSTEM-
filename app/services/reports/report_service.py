"""인사리포트 서비스"""
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import date, timedelta
from sqlalchemy import func
import json
from app.models.employee import Employee
from app.models.recruitment import Application, JobPosting
from app.models.attendance import Attendance, Leave
from app.models.payroll import Payroll

try:
    from app.core.ai_agent import ReportAgent, HRAIAgent
    AI_AGENT_AVAILABLE = True
except ImportError:
    AI_AGENT_AVAILABLE = False

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


class ReportService:
    """인사리포트 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
        # AI Agent 초기화 (옵션)
        if AI_AGENT_AVAILABLE:
            try:
                self.base_agent = HRAIAgent(db=db)
                self.report_agent = ReportAgent(self.base_agent)
            except Exception:
                # AI Agent 초기화 실패해도 리포트 서비스는 작동
                self.base_agent = None
                self.report_agent = None
        else:
            self.base_agent = None
            self.report_agent = None
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """대시보드 데이터 조회"""
        # 총 직원 수
        total_employees = self.db.query(func.count(Employee.id)).filter(
            Employee.status == "active"
        ).scalar()
        
        # 이번 달 채용 수
        this_month = date.today().replace(day=1)
        new_hires = self.db.query(func.count(Employee.id)).filter(
            Employee.hire_date >= this_month
        ).scalar()
        
        # 이직률 (최근 3개월)
        three_months_ago = date.today() - timedelta(days=90)
        terminations = self.db.query(func.count(Employee.id)).filter(
            Employee.termination_date >= three_months_ago,
            Employee.termination_date <= date.today()
        ).scalar()
        turnover_rate = (terminations / total_employees * 100) if total_employees > 0 else 0
        
        # 평균 급여
        avg_salary = self.db.query(func.avg(Employee.base_salary)).filter(
            Employee.status == "active"
        ).scalar() or 0
        
        # 진행 중인 채용 공고
        active_job_postings = self.db.query(func.count(JobPosting.id)).filter(
            JobPosting.status == "published"
        ).scalar()
        
        return {
            "total_employees": total_employees,
            "new_hires_this_month": new_hires,
            "turnover_rate": round(turnover_rate, 2),
            "average_salary": round(avg_salary, 0),
            "active_job_postings": active_job_postings
        }
    
    def get_turnover_analysis(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """이직률 분석"""
        terminations = self.db.query(Employee).filter(
            Employee.termination_date >= start_date,
            Employee.termination_date <= end_date
        ).all()
        
        # 부서별 이직률
        dept_terminations = {}
        for emp in terminations:
            dept = emp.department or "Unknown"
            dept_terminations[dept] = dept_terminations.get(dept, 0) + 1
        
        # 직급별 이직률
        position_terminations = {}
        for emp in terminations:
            pos = emp.position or "Unknown"
            position_terminations[pos] = position_terminations.get(pos, 0) + 1
        
        return {
            "total_terminations": len(terminations),
            "by_department": dept_terminations,
            "by_position": position_terminations,
            "terminations": [
                {
                    "name": emp.name,
                    "department": emp.department,
                    "position": emp.position,
                    "termination_date": emp.termination_date.isoformat()
                }
                for emp in terminations
            ]
        }
    
    def get_recruitment_metrics(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """채용 지표"""
        applications = self.db.query(Application).filter(
            Application.applied_date >= start_date,
            Application.applied_date <= end_date
        ).all()
        
        # 채용 기간 계산
        hired_applications = [a for a in applications if a.status == "accepted"]
        hiring_periods = []
        for app in hired_applications:
            if app.applied_date and app.offer_accepted_at:
                period = (app.offer_accepted_at - app.applied_date).days
                hiring_periods.append(period)
        
        avg_hiring_period = sum(hiring_periods) / len(hiring_periods) if hiring_periods else 0
        
        # 지원서 상태별 통계
        status_counts = {}
        for app in applications:
            status = app.status
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "total_applications": len(applications),
            "hired_count": len(hired_applications),
            "average_hiring_period": round(avg_hiring_period, 1),
            "status_breakdown": status_counts
        }
    
    def get_payroll_cost_analysis(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """급여 비용 분석"""
        payrolls = self.db.query(Payroll).filter(
            Payroll.pay_period_start >= start_date,
            Payroll.pay_period_end <= end_date,
            Payroll.status == "paid"
        ).all()
        
        total_cost = sum(p.gross_pay for p in payrolls)
        
        # 부서별 급여 비용
        dept_costs = {}
        for payroll in payrolls:
            dept = payroll.employee.department or "Unknown"
            dept_costs[dept] = dept_costs.get(dept, 0) + payroll.gross_pay
        
        return {
            "total_payroll_cost": total_cost,
            "payroll_count": len(payrolls),
            "average_payroll": total_cost / len(payrolls) if payrolls else 0,
            "by_department": dept_costs
        }
    
    def get_attendance_summary(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """근태 요약"""
        attendances = self.db.query(Attendance).filter(
            Attendance.attendance_date >= start_date,
            Attendance.attendance_date <= end_date
        ).all()
        
        total_work_hours = sum(a.work_hours or 0 for a in attendances)
        total_overtime = sum(a.overtime_hours or 0 for a in attendances)
        late_count = sum(1 for a in attendances if a.status == "late")
        absent_count = sum(1 for a in attendances if a.status == "absent")
        
        # 휴가 통계
        leaves = self.db.query(Leave).filter(
            Leave.start_date <= end_date,
            Leave.end_date >= start_date,
            Leave.status == "approved"
        ).all()
        
        total_leave_days = sum(l.days for l in leaves)
        
        return {
            "total_work_hours": total_work_hours,
            "total_overtime_hours": total_overtime,
            "late_count": late_count,
            "absent_count": absent_count,
            "total_leave_days": total_leave_days,
            "attendance_count": len(attendances)
        }
    
    def generate_custom_report(self, report_type: str, filters: Dict[str, Any]) -> str:
        """커스텀 리포트 생성"""
        # 데이터 수집
        data = self._collect_report_data(report_type, filters)
        
        # AI를 사용하여 리포트 생성
        if self.report_agent:
            report = self.report_agent.generate_report(data, report_type)
            return report
        else:
            # AI Agent가 없으면 기본 리포트 반환
            return f"{report_type} 리포트: {json.dumps(data, indent=2, ensure_ascii=False)}"
    
    def analyze_trends(self, metric: str, period: int = 12) -> Dict[str, Any]:
        """트렌드 분석"""
        # 과거 데이터 수집
        historical_data = []
        
        for i in range(period):
            month_start = date.today().replace(day=1) - timedelta(days=30 * i)
            month_end = month_start + timedelta(days=30)
            
            if metric == "turnover":
                data = self.get_turnover_analysis(month_start, month_end)
            elif metric == "recruitment":
                data = self.get_recruitment_metrics(month_start, month_end)
            elif metric == "payroll":
                data = self.get_payroll_cost_analysis(month_start, month_end)
            else:
                data = {}
            
            historical_data.append({
                "period": month_start.strftime("%Y-%m"),
                "data": data
            })
        
        # AI 트렌드 분석
        if self.report_agent:
            analysis = self.report_agent.analyze_trends(historical_data)
        else:
            analysis = "AI Agent를 사용할 수 없습니다."
        
        return {
            "historical_data": historical_data,
            "analysis": analysis
        }
    
    def _collect_report_data(self, report_type: str, filters: Dict[str, Any]) -> Dict[str, Any]:
        """리포트 데이터 수집"""
        start_date = filters.get("start_date", date.today() - timedelta(days=30))
        end_date = filters.get("end_date", date.today())
        
        if report_type == "turnover":
            return self.get_turnover_analysis(start_date, end_date)
        elif report_type == "recruitment":
            return self.get_recruitment_metrics(start_date, end_date)
        elif report_type == "payroll":
            return self.get_payroll_cost_analysis(start_date, end_date)
        elif report_type == "attendance":
            return self.get_attendance_summary(start_date, end_date)
        else:
            return {}
