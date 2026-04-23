"""Celery 기반 작업 스케줄 서비스."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.job_schedule import JobSchedule, JobScheduleRun
from app.models.user import User
from app.services.attendance_aggregate_service import AttendanceAggregateService
from app.services.employee_hr_analytics_service import build_hr_analytics_summary
from app.services.system_rbac_service import SystemRbacService
from app.utils.email_sender import send_email
from app.utils.simple_pdf import write_simple_text_pdf

JOB_TYPE_ATTENDANCE_AGGREGATE = "attendance_ot_allowance_aggregate"
JOB_TYPE_REPORT_EMAIL = "attendance_hr_report_pdf_email"
SUPPORTED_JOB_TYPES = {JOB_TYPE_ATTENDANCE_AGGREGATE, JOB_TYPE_REPORT_EMAIL}


class JobScheduleService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _payload_dict(raw: Optional[str]) -> Dict[str, Any]:
        if not raw:
            return {}
        try:
            v = json.loads(raw)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _json_str(v: Dict[str, Any]) -> str:
        return json.dumps(v, ensure_ascii=False)

    @staticmethod
    def _validate_time_local(time_local: str) -> str:
        t = (time_local or "").strip()
        datetime.strptime(t, "%H:%M")
        return t

    @staticmethod
    def _next_run_dt(timezone: str, time_local: str, weekdays_mask: int, now_utc: Optional[datetime] = None) -> Optional[datetime]:
        tz = ZoneInfo(timezone)
        now = (now_utc or datetime.utcnow()).replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        hh, mm = [int(x) for x in time_local.split(":")]
        for d in range(0, 14):
            cand_day = (now + timedelta(days=d)).date()
            wd = cand_day.weekday()
            if (weekdays_mask & (1 << wd)) == 0:
                continue
            cand = datetime(cand_day.year, cand_day.month, cand_day.day, hh, mm, tzinfo=tz)
            if cand > now:
                return cand.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        return None

    def list_schedules(self) -> List[JobSchedule]:
        return self.db.query(JobSchedule).order_by(JobSchedule.id.desc()).all()

    def create_schedule(self, data: Dict[str, Any]) -> JobSchedule:
        job_type = str(data.get("job_type") or "").strip()
        if job_type not in SUPPORTED_JOB_TYPES:
            raise ValueError("지원하지 않는 작업 유형입니다.")
        tz = str(data.get("timezone") or "Asia/Seoul").strip()
        time_local = self._validate_time_local(str(data.get("time_local") or "09:00"))
        payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
        run_as_user_id = int(data.get("run_as_user_id"))
        user = self.db.query(User).filter(User.id == run_as_user_id).first()
        if not user:
            raise ValueError("실행 사용자(run_as_user_id)를 찾을 수 없습니다.")
        weekdays_mask = int(data.get("weekdays_mask") or 0)
        if weekdays_mask <= 0:
            raise ValueError("요일 마스크(weekdays_mask)가 올바르지 않습니다.")
        row = JobSchedule(
            name=str(data.get("name") or "").strip() or "스케줄 작업",
            job_type=job_type,
            enabled=bool(data.get("enabled", True)),
            time_local=time_local,
            timezone=tz,
            weekdays_mask=weekdays_mask,
            run_as_user_id=run_as_user_id,
            company_id=data.get("company_id"),
            payload_json=self._json_str(payload),
        )
        row.next_run_at = self._next_run_dt(tz, time_local, weekdays_mask)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update_schedule(self, schedule_id: int, data: Dict[str, Any]) -> JobSchedule:
        row = self.db.query(JobSchedule).filter(JobSchedule.id == schedule_id).first()
        if not row:
            raise ValueError("스케줄을 찾을 수 없습니다.")
        if "name" in data and data.get("name") is not None:
            row.name = str(data.get("name")).strip() or row.name
        if "enabled" in data and data.get("enabled") is not None:
            row.enabled = bool(data.get("enabled"))
        if "time_local" in data and data.get("time_local") is not None:
            row.time_local = self._validate_time_local(str(data.get("time_local")))
        if "timezone" in data and data.get("timezone") is not None:
            row.timezone = str(data.get("timezone")).strip()
        if "weekdays_mask" in data and data.get("weekdays_mask") is not None:
            row.weekdays_mask = int(data.get("weekdays_mask"))
        if "run_as_user_id" in data and data.get("run_as_user_id") is not None:
            run_as_user_id = int(data.get("run_as_user_id"))
            user = self.db.query(User).filter(User.id == run_as_user_id).first()
            if not user:
                raise ValueError("실행 사용자(run_as_user_id)를 찾을 수 없습니다.")
            row.run_as_user_id = run_as_user_id
        if "company_id" in data:
            row.company_id = data.get("company_id")
        if "payload" in data and isinstance(data.get("payload"), dict):
            row.payload_json = self._json_str(data.get("payload"))
        row.next_run_at = self._next_run_dt(row.timezone, row.time_local, row.weekdays_mask)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete_schedule(self, schedule_id: int) -> None:
        row = self.db.query(JobSchedule).filter(JobSchedule.id == schedule_id).first()
        if not row:
            raise ValueError("스케줄을 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

    def list_runs(self, schedule_id: int, limit: int = 50) -> List[JobScheduleRun]:
        return (
            self.db.query(JobScheduleRun)
            .filter(JobScheduleRun.schedule_id == schedule_id)
            .order_by(JobScheduleRun.id.desc())
            .limit(max(1, min(200, int(limit or 50))))
            .all()
        )

    def get_due_schedule_ids(self) -> List[int]:
        rows = self.db.query(JobSchedule).filter(JobSchedule.enabled.is_(True)).all()
        now_utc = datetime.utcnow()
        due: List[int] = []
        for row in rows:
            if row.next_run_at and row.next_run_at <= now_utc:
                due.append(int(row.id))
        return due

    def execute_schedule(self, schedule_id: int, trigger: str = "manual") -> Dict[str, Any]:
        row = self.db.query(JobSchedule).filter(JobSchedule.id == schedule_id).first()
        if not row:
            raise ValueError("스케줄을 찾을 수 없습니다.")
        run = JobScheduleRun(schedule_id=row.id, status="running", started_at=datetime.utcnow())
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        try:
            payload = self._payload_dict(row.payload_json)
            actor = self.db.query(User).filter(User.id == row.run_as_user_id).first()
            if not actor:
                raise ValueError("실행 사용자를 찾을 수 없습니다.")
            if row.job_type == JOB_TYPE_ATTENDANCE_AGGREGATE:
                result = self._run_attendance_aggregate(actor, row.company_id, payload)
            elif row.job_type == JOB_TYPE_REPORT_EMAIL:
                result = self._run_report_pdf_email(actor, row.company_id, payload)
            else:
                raise ValueError("지원하지 않는 작업 유형입니다.")

            run.status = "success"
            run.message = f"completed by {trigger}"
            run.result_json = self._json_str(result)
            run.finished_at = datetime.utcnow()
            row.last_run_at = run.finished_at
            row.next_run_at = self._next_run_dt(row.timezone, row.time_local, row.weekdays_mask)
            self.db.commit()
            return result
        except Exception as e:
            run.status = "failed"
            run.message = str(e)
            run.finished_at = datetime.utcnow()
            row.next_run_at = self._next_run_dt(row.timezone, row.time_local, row.weekdays_mask)
            self.db.commit()
            raise

    def _run_attendance_aggregate(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        end_date = date.today() - timedelta(days=1)
        start_date = end_date
        if str(payload.get("date_mode") or "").strip() == "last_7_days":
            start_date = end_date - timedelta(days=6)
        preserve_manual_ot = bool(payload.get("preserve_manual_ot", True))
        return AttendanceAggregateService(self.db).run(
            actor,
            start_date,
            end_date,
            company_id=company_id,
            preserve_manual_ot=preserve_manual_ot,
        )

    def _run_report_pdf_email(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        recipient_emails = payload.get("recipient_emails") or []
        if isinstance(recipient_emails, str):
            recipient_emails = [x.strip() for x in recipient_emails.split(",") if x.strip()]
        if not recipient_emails:
            raise ValueError("수신자 이메일이 없습니다.")
        months = int(payload.get("months") or 12)
        allowed = SystemRbacService(self.db).get_user_company_ids(actor.id, current_user=actor)
        summary = build_hr_analytics_summary(self.db, allowed, company_id, trend_months=months)
        lines = [
            f"회사ID: {company_id if company_id else 'ALL'}",
            f"기준일: {summary.get('as_of')}",
            f"재직 인원: {summary.get('kpi', {}).get('active_count', 0)}",
            f"전체 인원: {summary.get('kpi', {}).get('all_count', 0)}",
            f"재직 비율: {summary.get('kpi', {}).get('active_rate', 0)}%",
        ]
        report_dir = Path("storage") / "scheduled_reports"
        report_name = f"hr_attendance_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
        report_path = write_simple_text_pdf(str(report_dir / report_name), "HR/Attendance Scheduled Report", lines)
        subject = "[HR AI AGENT] 스케줄 리포트 PDF"
        body = "예약 실행된 출/퇴근 및 인사 리포트 PDF를 첨부합니다."
        for email in recipient_emails:
            send_email(email, subject, body, attachment=report_path)
        return {"report_path": report_path, "recipients": recipient_emails}
