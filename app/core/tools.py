"""AI Agent 도구 (Tools)"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.services.master_data import MasterDataService
from app.services.payroll import PayrollService
from app.services.reports import ReportService
from app.services.attendance import AttendanceService
from datetime import date, timedelta

try:
    from langchain.tools import Tool
    LANGCHAIN_TOOLS_AVAILABLE = True
except ImportError:
    try:
        from langchain_core.tools import Tool
        LANGCHAIN_TOOLS_AVAILABLE = True
    except ImportError:
        LANGCHAIN_TOOLS_AVAILABLE = False


def create_hr_tools(db: Session) -> List:
    """HR 관련 도구 생성"""
    
    def get_employee_info(employee_id_or_name: str) -> str:
        """직원 정보 조회"""
        try:
            service = MasterDataService(db)
            # ID로 조회 시도
            try:
                employee_id = int(employee_id_or_name)
                employee = service.get_employee(employee_id)
            except ValueError:
                # 이름으로 검색
                employees = service.get_employees()
                employee = next((e for e in employees if employee_id_or_name in e.name), None)
            
            if not employee:
                return f"직원을 찾을 수 없습니다: {employee_id_or_name}"
            
            return f"""
직원 정보:
- 이름: {employee.name}
- 사번: {employee.employee_number}
- 부서: {employee.department or '미지정'}
- 직책: {employee.position or '미지정'}
- 입사일: {employee.hire_date}
- 상태: {employee.status}
- 기본급: {employee.base_salary:,.0f}원 (설정된 경우)
"""
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def list_employees(department: Optional[str] = None) -> str:
        """직원 목록 조회"""
        try:
            service = MasterDataService(db)
            filters = {}
            if department and department != "전체":
                filters["department"] = department
            
            employees = service.get_employees(filters)
            
            if not employees:
                return "직원이 없습니다."
            
            result = f"총 {len(employees)}명의 직원:\n\n"
            for emp in employees[:10]:  # 최대 10명만 표시
                result += f"- {emp.name} ({emp.employee_number}) - {emp.department or '미지정'} {emp.position or ''}\n"
            
            if len(employees) > 10:
                result += f"\n... 외 {len(employees) - 10}명"
            
            return result
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def get_dashboard_stats() -> str:
        """대시보드 통계 조회"""
        try:
            service = ReportService(db)
            stats = service.get_dashboard_data()
            
            return f"""
인사 현황:
- 총 직원 수: {stats['total_employees']}명
- 이번 달 신규 채용: {stats['new_hires_this_month']}명
- 이직률: {stats['turnover_rate']}%
- 평균 급여: {stats['average_salary']:,.0f}원
- 진행 중인 채용 공고: {stats['active_job_postings']}건
"""
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def calculate_payroll_info(employee_id: str, month: Optional[str] = None) -> str:
        """급여 정보 조회"""
        try:
            employee_id_int = int(employee_id)
            service = PayrollService(db)
            
            # 이번 달 급여 이력 조회
            payrolls = service.get_payroll_history(employee_id_int, limit=1)
            
            if payrolls:
                latest = payrolls[0]
                return f"""
최근 급여 정보:
- 급여 기간: {latest.pay_period_start} ~ {latest.pay_period_end}
- 총 급여: {latest.gross_pay:,.0f}원
- 실수령액: {latest.net_pay:,.0f}원
- 상태: {latest.status}
"""
            else:
                return f"직원 ID {employee_id_int}의 급여 이력이 없습니다."
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def calculate_payroll(employee_id_and_period: str) -> str:
        """급여 계산 실행"""
        try:
            # 입력 파싱: "직원ID,기간" 또는 "직원ID" 형식
            parts = employee_id_and_period.split(',')
            employee_id_str = parts[0].strip()
            period = parts[1].strip() if len(parts) > 1 else "이번 달"
            
            employee_id_int = int(employee_id_str)
            service = PayrollService(db)
            
            # 기간 계산
            today = date.today()
            
            if period == "이번 달" or period == "이번달":
                # 이번 달 1일부터 오늘까지
                period_start = date(today.year, today.month, 1)
                period_end = today
            elif period == "지난 달" or period == "지난달":
                # 지난 달 전체
                if today.month == 1:
                    period_start = date(today.year - 1, 12, 1)
                    period_end = date(today.year - 1, 12, 31)
                else:
                    period_start = date(today.year, today.month - 1, 1)
                    # 지난 달 마지막 날
                    last_day = monthrange(period_start.year, period_start.month)[1]
                    period_end = date(period_start.year, period_start.month, last_day)
            else:
                # 기본값: 이번 달
                period_start = date(today.year, today.month, 1)
                period_end = today
            
            # 급여 계산 실행
            payroll = service.calculate_payroll(employee_id_int, period_start, period_end)
            
            return f"""
급여 계산 완료:

직원 ID: {employee_id_int}
급여 기간: {period_start} ~ {period_end}
지급일: {payroll.pay_date}

급여 내역:
- 기본급: {payroll.base_salary:,.0f}원
- 연장근무수당: {payroll.overtime_pay:,.0f}원
- 총 급여: {payroll.gross_pay:,.0f}원
- 총 공제: {payroll.total_deductions:,.0f}원
- 실수령액: {payroll.net_pay:,.0f}원

상태: {payroll.status}
근무 시간: {payroll.attendance_hours or 0:.1f}시간

급여 계산이 완료되었습니다. 승인 후 지급할 수 있습니다.
"""
        except ValueError as e:
            return f"입력 오류: {str(e)}. 형식: '직원ID,기간' (예: '1,이번 달')"
        except Exception as e:
            return f"급여 계산 오류: {str(e)}"
    
    def get_attendance_summary(employee_id: str, days: str = "30") -> str:
        """근태 요약 조회"""
        try:
            employee_id_int = int(employee_id)
            days_int = int(days)
            service = AttendanceService(db)
            
            end_date = date.today()
            start_date = end_date - timedelta(days=days_int)
            
            summary = service.get_attendance_summary(employee_id_int, start_date, end_date)
            
            return f"""
근태 요약 ({start_date} ~ {end_date}):
- 총 근무 시간: {summary['total_work_hours']:.1f}시간
- 연장 근무: {summary['total_overtime_hours']:.1f}시간
- 지각: {summary['late_count']}회
- 결근: {summary['absent_count']}회
- 출근 일수: {summary['attendance_count']}일
"""
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def generate_report(report_type: str, period: str = "최근 1개월") -> str:
        """리포트 생성"""
        try:
            service = ReportService(db)
            end_date = date.today()
            start_date = end_date - timedelta(days=30)
            
            if report_type == "이직률":
                data = service.get_turnover_analysis(start_date, end_date)
                return f"""
이직률 분석 리포트:
- 총 퇴사자: {data['total_terminations']}명
- 부서별: {data['by_department']}
"""
            elif report_type == "채용":
                data = service.get_recruitment_metrics(start_date, end_date)
                return f"""
채용 지표 리포트:
- 총 지원서: {data['total_applications']}건
- 채용 완료: {data['hired_count']}명
- 평균 채용 기간: {data['average_hiring_period']}일
"""
            elif report_type == "급여비용":
                data = service.get_payroll_cost_analysis(start_date, end_date)
                return f"""
급여 비용 분석 리포트:
- 총 급여 비용: {data['total_payroll_cost']:,.0f}원
- 평균 급여: {data['average_payroll']:,.0f}원
"""
            else:
                return f"지원하지 않는 리포트 타입: {report_type}"
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    # 도구 정의
    if not LANGCHAIN_TOOLS_AVAILABLE:
        return []
    
    tools = [
        Tool(
            name="get_employee_info",
            func=get_employee_info,
            description="직원 ID 또는 이름으로 직원 정보를 조회합니다. 입력: 직원 ID 또는 이름"
        ),
        Tool(
            name="list_employees",
            func=list_employees,
            description="직원 목록을 조회합니다. 부서를 지정할 수 있습니다. 입력: 부서명 (선택사항, '전체' 또는 빈 문자열)"
        ),
        Tool(
            name="get_dashboard_stats",
            func=get_dashboard_stats,
            description="인사 대시보드 통계를 조회합니다. 입력: 없음 (빈 문자열)"
        ),
        Tool(
            name="calculate_payroll_info",
            func=calculate_payroll_info,
            description="직원의 급여 정보를 조회합니다. 입력: 직원 ID"
        ),
        Tool(
            name="calculate_payroll",
            func=calculate_payroll,
            description="직원의 급여를 계산합니다. 입력: '직원ID,기간' 형식 (예: '1,이번 달' 또는 '1,지난 달'). 기간은 '이번 달', '지난 달' 중 선택 가능. 기간을 생략하면 '이번 달'로 계산됩니다."
        ),
        Tool(
            name="get_attendance_summary",
            func=get_attendance_summary,
            description="직원의 근태 요약을 조회합니다. 입력: '직원ID,일수' 형식 (예: '1,30')"
        ),
        Tool(
            name="generate_report",
            func=generate_report,
            description="인사 리포트를 생성합니다. 리포트 타입: '이직률', '채용', '급여비용'. 입력: 리포트 타입"
        ),
    ]
    
    return tools
