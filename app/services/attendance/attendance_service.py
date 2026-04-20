"""근태관리 서비스"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, date, time, timedelta
from app.models.attendance import Attendance, Leave, Schedule, LeaveStatus
from app.models.employee import Employee
from app.utils.geofencing import check_geofence


class AttendanceService:
    """근태관리 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def record_check_in(self, employee_id: int, record_method: str, 
                       location: Optional[Dict[str, float]] = None,
                       ip_address: Optional[str] = None) -> Attendance:
        """출근 기록"""
        today = date.today()
        
        # 오늘 날짜의 출근 기록이 이미 있는지 확인
        existing = self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.attendance_date == today
        ).first()
        
        if existing and existing.check_in_time:
            raise ValueError("이미 출근 기록이 있습니다.")
        
        if existing:
            attendance = existing
        else:
            attendance = Attendance(
                employee_id=employee_id,
                attendance_date=today
            )
            self.db.add(attendance)
        
        attendance.check_in_time = datetime.now()
        attendance.record_method = record_method
        attendance.location = location
        attendance.ip_address = ip_address
        
        # GPS 지오펜싱 확인
        if location:
            is_within_geofence = check_geofence(location, employee_id)
            if not is_within_geofence:
                attendance.notes = "지정된 지역 외부에서 출근 기록"
        
        self.db.commit()
        self.db.refresh(attendance)
        return attendance
    
    def record_check_out(self, employee_id: int, record_method: str,
                        location: Optional[Dict[str, float]] = None,
                        ip_address: Optional[str] = None) -> Attendance:
        """퇴근 기록"""
        today = date.today()
        
        attendance = self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.attendance_date == today
        ).first()
        
        if not attendance:
            raise ValueError("출근 기록이 없습니다.")
        
        if attendance.check_out_time:
            raise ValueError("이미 퇴근 기록이 있습니다.")
        
        attendance.check_out_time = datetime.now()
        attendance.record_method = record_method
        if location:
            attendance.location = location
        if ip_address:
            attendance.ip_address = ip_address
        
        # 근무 시간 계산
        if attendance.check_in_time:
            work_duration = attendance.check_out_time - attendance.check_in_time
            attendance.work_hours = work_duration.total_seconds() / 3600
        
        # 상태 업데이트
        attendance.status = self._calculate_status(attendance)
        
        self.db.commit()
        self.db.refresh(attendance)
        return attendance
    
    def apply_leave(self, employee_id: int, leave_data: Dict[str, Any]) -> Leave:
        """휴가 신청"""
        start_date = leave_data["start_date"]
        end_date = leave_data["end_date"]
        
        # 휴가 일수 계산
        days = (end_date - start_date).days + 1
        
        # 연차 잔여 일수 확인
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError("직원을 찾을 수 없습니다.")
        
        # 실제로는 연차 잔여 일수를 확인하는 로직 필요
        # remaining_leave = self._get_remaining_annual_leave(employee_id)
        # if leave_data["leave_type"] == "annual" and days > remaining_leave:
        #     raise ValueError("연차 잔여 일수가 부족합니다.")
        
        leave = Leave(
            employee_id=employee_id,
            leave_type=leave_data["leave_type"],
            start_date=start_date,
            end_date=end_date,
            days=days,
            reason=leave_data.get("reason")
        )
        
        self.db.add(leave)
        self.db.commit()
        self.db.refresh(leave)
        return leave
    
    def approve_leave(self, leave_id: int, approver_id: int, notes: Optional[str] = None) -> Leave:
        """휴가 승인"""
        leave = self.db.query(Leave).filter(Leave.id == leave_id).first()
        if not leave:
            raise ValueError("휴가 신청을 찾을 수 없습니다.")
        
        leave.status = LeaveStatus.APPROVED.value
        leave.approver_id = approver_id
        leave.approved_at = datetime.now()
        leave.approval_notes = notes
        
        self.db.commit()
        self.db.refresh(leave)
        return leave
    
    def reject_leave(self, leave_id: int, approver_id: int, notes: Optional[str] = None) -> Leave:
        """휴가 거절"""
        leave = self.db.query(Leave).filter(Leave.id == leave_id).first()
        if not leave:
            raise ValueError("휴가 신청을 찾을 수 없습니다.")
        
        leave.status = LeaveStatus.REJECTED.value
        leave.approver_id = approver_id
        leave.approved_at = datetime.now()
        leave.approval_notes = notes
        
        self.db.commit()
        self.db.refresh(leave)
        return leave
    
    def create_schedule(self, employee_id: int, schedule_data: Dict[str, Any]) -> Schedule:
        """근무 스케줄 생성"""
        schedule = Schedule(
            employee_id=employee_id,
            **schedule_data
        )
        self.db.add(schedule)
        self.db.commit()
        self.db.refresh(schedule)
        return schedule
    
    def get_attendance_summary(self, employee_id: int, start_date: date, end_date: date) -> Dict[str, Any]:
        """근태 요약 조회"""
        attendances = self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.attendance_date >= start_date,
            Attendance.attendance_date <= end_date
        ).all()
        
        total_work_hours = sum(a.work_hours or 0 for a in attendances)
        total_overtime_hours = sum(a.overtime_hours or 0 for a in attendances)
        late_count = sum(1 for a in attendances if a.status == "late")
        absent_count = sum(1 for a in attendances if a.status == "absent")
        
        return {
            "total_work_hours": total_work_hours,
            "total_overtime_hours": total_overtime_hours,
            "late_count": late_count,
            "absent_count": absent_count,
            "attendance_count": len(attendances)
        }
    
    def export_to_payroll(self, employee_id: int, period_start: date, period_end: date) -> Dict[str, Any]:
        """급여 시스템으로 내보내기"""
        attendances = self.db.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.attendance_date >= period_start,
            Attendance.attendance_date <= period_end
        ).all()
        
        total_hours = sum(a.work_hours or 0 for a in attendances)
        total_overtime = sum(a.overtime_hours or 0 for a in attendances)
        
        return {
            "employee_id": employee_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_work_hours": total_hours,
            "total_overtime_hours": total_overtime,
            "attendance_records": len(attendances)
        }
    
    def _calculate_status(self, attendance: Attendance) -> str:
        """출퇴근 상태 계산"""
        if not attendance.check_in_time or not attendance.check_out_time:
            return "normal"
        
        # 스케줄 확인
        schedule = self.db.query(Schedule).filter(
            Schedule.employee_id == attendance.employee_id,
            Schedule.schedule_date == attendance.attendance_date
        ).first()
        
        if schedule and schedule.start_time:
            # 지각 확인
            check_in_time = attendance.check_in_time.time()
            if check_in_time > schedule.start_time:
                return "late"
            
            # 조기 퇴근 확인
            check_out_time = attendance.check_out_time.time()
            if schedule.end_time and check_out_time < schedule.end_time:
                return "early_leave"
        
        # 연장 근무 확인
        if attendance.overtime_hours and attendance.overtime_hours > 0:
            return "overtime"
        
        return "normal"
