"""Celery 기반 작업 스케줄 서비스."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.job_schedule import JobSchedule, JobScheduleRun
from app.models.user import User
from app.services.attendance_aggregate_service import AttendanceAggregateService
from app.services.attendance_payroll_bucket_service import AttendancePayrollBucketService
from app.services.attendance_time_day_service import AttendanceTimeDayService
from app.services.employee_hr_analytics_service import build_hr_analytics_summary
from app.services.system_rbac_service import SystemRbacService
from app.utils.email_sender import send_email
from app.utils.simple_pdf import write_simple_text_pdf

JOB_TYPE_ATTENDANCE_AGGREGATE = "attendance_ot_allowance_aggregate"
JOB_TYPE_PAYROLL_MONTHLY_AGGREGATE = "payroll_master_monthly_aggregate"
JOB_TYPE_REPORT_EMAIL = "attendance_hr_report_pdf_email"
JOB_TYPE_HR_REPORT_EMAIL = "hr_report_pdf_email"
JOB_TYPE_ATTENDANCE_REPORT_EMAIL = "attendance_report_pdf_email"
SUPPORTED_JOB_TYPES = {
    JOB_TYPE_ATTENDANCE_AGGREGATE,
    JOB_TYPE_PAYROLL_MONTHLY_AGGREGATE,
    JOB_TYPE_REPORT_EMAIL,
    JOB_TYPE_HR_REPORT_EMAIL,
    JOB_TYPE_ATTENDANCE_REPORT_EMAIL,
}


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
    def _parse_bool(value: Any, default: bool) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        s = str(value).strip().lower()
        if s in {"1", "true", "t", "yes", "y", "on"}:
            return True
        if s in {"0", "false", "f", "no", "n", "off", ""}:
            return False
        return default

    def _company_display_name(self, company_id: Optional[int]) -> str:
        if not company_id:
            return "전체 회사"
        company = self.db.query(Company).filter(Company.id == int(company_id)).first()
        if not company:
            return f"회사 #{company_id}"
        return (
            str(company.name_kor or "").strip()
            or str(company.name_eng or "").strip()
            or str(company.name_thai or "").strip()
            or str(company.company_code or "").strip()
            or f"회사 #{company_id}"
        )

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
                last_pct = -1

                def _on_progress(done: int, total: int, percent: int) -> None:
                    nonlocal last_pct
                    # 5% 단위(또는 100%)로 진행률을 기록해 과도한 DB commit을 방지
                    if percent == 100 or percent - last_pct >= 5:
                        last_pct = percent
                        run.status = "running"
                        run.message = f"running {percent}% ({done}/{total})"
                        self.db.commit()

                result = self._run_attendance_aggregate(actor, row.company_id, payload, on_progress=_on_progress)
            elif row.job_type == JOB_TYPE_PAYROLL_MONTHLY_AGGREGATE:
                result = self._run_payroll_monthly_aggregate(actor, row.company_id, payload)
            elif row.job_type == JOB_TYPE_REPORT_EMAIL:
                result = self._run_report_pdf_email(actor, row.company_id, payload)
            elif row.job_type == JOB_TYPE_HR_REPORT_EMAIL:
                result = self._run_hr_report_pdf_email(actor, row.company_id, payload)
            elif row.job_type == JOB_TYPE_ATTENDANCE_REPORT_EMAIL:
                result = self._run_attendance_report_pdf_email(actor, row.company_id, payload)
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

    def _run_attendance_aggregate(
        self,
        actor: User,
        company_id: Optional[int],
        payload: Dict[str, Any],
        on_progress: Optional[Callable[[int, int, int], None]] = None,
    ) -> Dict[str, Any]:
        today = date.today()
        mode = str(payload.get("date_mode") or "yesterday").strip().lower()
        if mode == "today":
            start_date = today
            end_date = today
        elif mode == "yesterday_today":
            start_date = today - timedelta(days=1)
            end_date = today
        elif mode == "last_7_days":  # backward compatibility for existing schedules
            end_date = today - timedelta(days=1)
            start_date = end_date - timedelta(days=6)
        else:
            end_date = today - timedelta(days=1)
            start_date = end_date
        # 근태/OT/수당 계산 화면의 API 해석과 동일하게 문자열 불리언도 안전하게 처리한다.
        preserve_manual_ot = self._parse_bool(payload.get("preserve_manual_ot"), default=False)
        result: Optional[Dict[str, Any]] = None
        for ev in AttendanceAggregateService(self.db).iter_run(
            actor,
            date_from=start_date,
            date_to=end_date,
            company_id=company_id,
            preserve_manual_ot=preserve_manual_ot,
        ):
            if ev.get("type") == "progress":
                done = int(ev.get("done") or 0)
                total = int(ev.get("total") or 0)
                percent = int(ev.get("percent") or 0)
                if on_progress is not None:
                    on_progress(done, total, percent)
            elif ev.get("type") == "done":
                r = ev.get("result")
                if isinstance(r, dict):
                    result = r
        if not result:
            raise RuntimeError("집계가 완료되지 않았습니다.")
        return result

    def _run_payroll_monthly_aggregate(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        if not company_id:
            raise ValueError("급여마스터 월 집계는 company_id가 필요합니다.")
        run_on = int(payload.get("run_on_day") or 1)
        today = date.today()
        if run_on > 0 and today.day != run_on:
            return {
                "skipped": True,
                "reason": f"run_on_day={run_on} (today={today.day})",
                "company_id": company_id,
            }
        month_offset = int(payload.get("month_offset") or -1)
        base = date(today.year, today.month, 1)
        year = base.year
        month = base.month + month_offset
        while month <= 0:
            month += 12
            year -= 1
        while month > 12:
            month -= 12
            year += 1
        period_label = str(payload.get("period_label") or "Period 1").strip() or "Period 1"
        coverage = str(payload.get("coverage") or "all").strip() or "all"
        department_code = payload.get("department_code")
        income_ot_only = bool(payload.get("income_ot_only", False))
        e_from = payload.get("employee_code_from")
        e_to = payload.get("employee_code_to")
        employee_code_from = str(e_from).strip() if e_from is not None and str(e_from).strip() else None
        employee_code_to = str(e_to).strip() if e_to is not None and str(e_to).strip() else None
        result = AttendancePayrollBucketService(self.db).compute_for_period(
            actor,
            company_id=company_id,
            calendar_year=year,
            calendar_month=month,
            period_label=period_label,
            coverage=coverage,
            employee_code_from=employee_code_from,
            employee_code_to=employee_code_to,
            department_code=department_code,
            income_ot_only=income_ot_only,
            employee_ids=None,
        )
        return {
            "company_id": company_id,
            "calendar_year": year,
            "calendar_month": month,
            "period_label": period_label,
            "employee_count": int(result.get("employee_count") or 0),
        }

    def _run_report_pdf_email(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        # Backward compatibility: old unified report type behaves as HR report.
        return self._run_hr_report_pdf_email(actor, company_id, payload)

    def _run_hr_report_pdf_email(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        recipient_emails = payload.get("recipient_emails") or []
        if isinstance(recipient_emails, str):
            recipient_emails = [x.strip() for x in recipient_emails.split(",") if x.strip()]
        if not recipient_emails:
            raise ValueError("수신자 이메일이 없습니다.")
        run_on_day = int(payload.get("run_on_day") or 0)
        if run_on_day > 0 and date.today().day != run_on_day:
            return {"skipped": True, "reason": f"run_on_day={run_on_day} 불일치"}
        months = int(payload.get("months") or 12)
        period_type = str(payload.get("period_type") or "daily").strip().lower()
        report_format = str(payload.get("report_format") or "pdf").strip().lower()
        allowed = SystemRbacService(self.db).get_user_company_ids(actor.id, current_user=actor)
        summary = build_hr_analytics_summary(self.db, allowed, company_id, trend_months=months)
        company_name = self._company_display_name(company_id)
        lines = [
            f"회사명: {company_name}",
            f"기간유형: {period_type}",
            f"기준일: {summary.get('as_of')}",
            f"재직 인원: {int((summary.get('totals') or {}).get('employees_active', 0))}",
            f"전체 인원: {int((summary.get('totals') or {}).get('employees_all', 0))}",
        ]
        html_report = self._build_hr_report_html(
            summary=summary,
            company_name=company_name,
            period_type=period_type,
            months=months,
        )
        report_dir = Path("storage") / "scheduled_reports"
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        if report_format == "html":
            report_name = f"hr_report_{ts}.html"
            report_path = str(report_dir / report_name)
            Path(report_path).parent.mkdir(parents=True, exist_ok=True)
            Path(report_path).write_text(html_report, encoding="utf-8")
        else:
            report_name = f"hr_report_{ts}.pdf"
            report_path = write_simple_text_pdf(str(report_dir / report_name), "HR Scheduled Report", lines)
        subject = "[HR AI AGENT] 인사 리포트"
        body = "예약 실행된 인사 리포트를 전송합니다."
        for email in recipient_emails:
            if report_format == "html":
                # 요구사항: HTML 리포트는 첨부가 아니라 메일 본문으로 전송
                send_email(email, subject, body, attachment=None, html_body=html_report)
            else:
                send_email(email, subject, body, attachment=report_path)
        return {"report_path": report_path, "report_format": report_format, "recipients": recipient_emails}

    def _build_hr_report_html(
        self,
        summary: Dict[str, Any],
        company_name: str,
        period_type: str,
        months: int,
    ) -> str:
        def _fmt_num(v: Any) -> str:
            if v is None:
                return "-"
            if isinstance(v, bool):
                return str(v)
            if isinstance(v, int):
                return f"{v:,}"
            if isinstance(v, float):
                if v.is_integer():
                    return f"{int(v):,}"
                return f"{v:,.1f}"
            if isinstance(v, str):
                s = v.strip()
                if not s:
                    return "-"
                try:
                    if "." in s:
                        fv = float(s)
                        return f"{fv:,.1f}" if not fv.is_integer() else f"{int(fv):,}"
                    iv = int(s)
                    return f"{iv:,}"
                except Exception:
                    return s
            return str(v)

        totals = summary.get("totals") or {}
        active = int(totals.get("employees_active", 0) or 0)
        all_emp = int(totals.get("employees_all", 0) or 0)
        # 웹 인사레포트(insights.ratePct)와 동일한 반올림 규칙: 소수 1자리
        active_rate = (round((active / all_emp) * 1000) / 10) if all_emp > 0 else 0.0
        active_rate_display = f"{int(active_rate)}%" if float(active_rate).is_integer() else f"{active_rate}%"
        monthly = summary.get("monthly_trend") or []
        age_gender = summary.get("age_gender") or []
        gender_totals = summary.get("gender_totals") or {"male": 0, "female": 0, "unknown": 0}
        by_department = summary.get("by_department") or []
        by_emp_type = summary.get("by_employment_type") or []
        by_work_status = summary.get("by_work_status") or []
        by_nationality = summary.get("by_nationality") or []
        by_job_level = summary.get("by_job_level") or []
        by_position = summary.get("by_position") or []
        department_workforce = summary.get("department_workforce") or []
        hire_cohort_summary = summary.get("hire_cohort_summary") or []
        as_of = str(summary.get("as_of") or "")

        def _rows(items: List[Dict[str, Any]], cols: List[str]) -> str:
            out: List[str] = []
            for item in items[:20]:
                tds = "".join(f"<td>{_fmt_num(item.get(c, ''))}</td>" for c in cols)
                out.append(f"<tr>{tds}</tr>")
            if not out:
                return "<tr><td colspan='10'>데이터 없음</td></tr>"
            return "".join(out)

        def _line_chart_svg(items: List[Dict[str, Any]]) -> str:
            if not items:
                return "<div class='empty'>차트 데이터 없음</div>"
            width = 980
            height = 260
            pad_left = 50
            pad_right = 18
            pad_top = 16
            pad_bottom = 36
            chart_w = width - pad_left - pad_right
            chart_h = height - pad_top - pad_bottom
            vals: List[int] = []
            for x in items:
                vals.append(int(x.get("headcount", 0) or 0))
                vals.append(int(x.get("hires", 0) or 0))
                vals.append(int(x.get("terminations", 0) or 0))
            if not vals:
                return "<div class='empty'>차트 데이터 없음</div>"
            vmin = min(vals)
            vmax = max(vals)
            if vmax == vmin:
                vmax = vmin + 1

            points_head: List[str] = []
            points_hires: List[str] = []
            points_terms: List[str] = []
            circle_head: List[str] = []
            circle_hires: List[str] = []
            circle_terms: List[str] = []
            labels: List[str] = []
            for idx, row in enumerate(items):
                x = pad_left + int((chart_w * idx) / max(1, len(items) - 1))
                head = int(row.get("headcount", 0) or 0)
                hires = int(row.get("hires", 0) or 0)
                terms = int(row.get("terminations", 0) or 0)
                y_head = pad_top + int((vmax - head) * chart_h / (vmax - vmin))
                y_hires = pad_top + int((vmax - hires) * chart_h / (vmax - vmin))
                y_terms = pad_top + int((vmax - terms) * chart_h / (vmax - vmin))
                points_head.append(f"{x},{y_head}")
                points_hires.append(f"{x},{y_hires}")
                points_terms.append(f"{x},{y_terms}")
                ym = str(row.get("year_month", ""))
                circle_head.append(f"<circle cx='{x}' cy='{y_head}' r='3' fill='#4f46e5'><title>{ym} 재직 {head:,}</title></circle>")
                circle_hires.append(f"<circle cx='{x}' cy='{y_hires}' r='2' fill='#059669'><title>{ym} 입사 {hires:,}</title></circle>")
                circle_terms.append(f"<circle cx='{x}' cy='{y_terms}' r='2' fill='#e11d48'><title>{ym} 퇴사 {terms:,}</title></circle>")
                if idx in (0, len(items) - 1) or idx % max(1, len(items) // 6) == 0:
                    labels.append(
                        f"<text x='{x}' y='{height-12}' text-anchor='middle' font-size='11' fill='#64748b'>{row.get('year_month','')}</text>"
                    )

            y_ticks: List[str] = []
            y_labels: List[str] = []
            for i in range(5):
                ratio = i / 4
                yv = int(vmax - ((vmax - vmin) * ratio))
                y = pad_top + int(chart_h * ratio)
                y_ticks.append(f"<line x1='{pad_left}' y1='{y}' x2='{width-pad_right}' y2='{y}' stroke='#e2e8f0' stroke-width='1'/>")
                y_labels.append(f"<text x='{pad_left-6}' y='{y+4}' text-anchor='end' font-size='11' fill='#64748b'>{yv:,}</text>")

            return (
                f"<svg viewBox='0 0 {width} {height}' width='100%' height='260' role='img' aria-label='인원 증감 추이 차트'>"
                + "".join(y_ticks)
                + "".join(y_labels)
                + f"<polyline fill='none' stroke='#4f46e5' stroke-width='3' points='{' '.join(points_head)}'/>"
                + f"<polyline fill='none' stroke='#059669' stroke-width='2' points='{' '.join(points_hires)}'/>"
                + f"<polyline fill='none' stroke='#e11d48' stroke-width='2' points='{' '.join(points_terms)}'/>"
                + "".join(circle_head)
                + "".join(circle_hires)
                + "".join(circle_terms)
                + "".join(labels)
                + (
                    "<g>"
                    "<rect x='70' y='8' width='10' height='10' fill='#4f46e5' /><text x='84' y='17' font-size='11' fill='#334155'>재직</text>"
                    "<rect x='125' y='8' width='10' height='10' fill='#059669' /><text x='139' y='17' font-size='11' fill='#334155'>입사</text>"
                    "<rect x='180' y='8' width='10' height='10' fill='#e11d48' /><text x='194' y='17' font-size='11' fill='#334155'>퇴사</text>"
                    "</g>"
                )
                + "</svg>"
            )

        def _age_gender_svg(items: List[Dict[str, Any]]) -> str:
            if not items:
                return "<div class='empty'>차트 데이터 없음</div>"
            width = 980
            height = 280
            pad_left = 50
            pad_right = 20
            pad_top = 14
            pad_bottom = 58
            chart_w = width - pad_left - pad_right
            chart_h = height - pad_top - pad_bottom

            rows = []
            max_total = 0
            age_map = {
                "lt20": "20세 미만",
                "20s": "20대",
                "30s": "30대",
                "40s": "40대",
                "50s": "50대",
                "60p": "60대 이상",
                "unknown": "정보없음",
            }
            for r in items:
                male = int(r.get("male", 0) or 0)
                female = int(r.get("female", 0) or 0)
                unknown = int(r.get("unknown", 0) or 0)
                total = male + female + unknown
                max_total = max(max_total, total)
                rows.append((age_map.get(str(r.get("age_bucket", "")), str(r.get("age_bucket", ""))), male, female, unknown))
            if max_total <= 0:
                max_total = 1

            bar_w = max(18, int(chart_w / max(1, len(rows) * 2)))
            gap = max(8, int((chart_w - len(rows) * bar_w) / max(1, len(rows) + 1)))
            x = pad_left + gap
            bars: List[str] = []
            labels: List[str] = []
            for label, male, female, unknown in rows:
                h_m = int((male / max_total) * chart_h)
                h_f = int((female / max_total) * chart_h)
                h_u = int((unknown / max_total) * chart_h)
                y0 = pad_top + chart_h
                if h_m > 0:
                    bars.append(f"<rect x='{x}' y='{y0-h_m}' width='{bar_w}' height='{h_m}' fill='#4f46e5'/>")
                    y0 -= h_m
                if h_f > 0:
                    bars.append(f"<rect x='{x}' y='{y0-h_f}' width='{bar_w}' height='{h_f}' fill='#db2777'/>")
                    y0 -= h_f
                if h_u > 0:
                    bars.append(f"<rect x='{x}' y='{y0-h_u}' width='{bar_w}' height='{h_u}' fill='#94a3b8'/>")
                labels.append(f"<text x='{x + bar_w//2}' y='{height-20}' text-anchor='middle' font-size='10' fill='#64748b'>{label}</text>")
                x += bar_w + gap

            return (
                f"<svg viewBox='0 0 {width} {height}' width='100%' height='280' role='img' aria-label='연령 성별 분포 차트'>"
                + f"<line x1='{pad_left}' y1='{pad_top+chart_h}' x2='{width-pad_right}' y2='{pad_top+chart_h}' stroke='#e2e8f0'/>"
                + "".join(bars)
                + "".join(labels)
                + (
                    "<g>"
                    "<rect x='70' y='8' width='10' height='10' fill='#4f46e5'/><text x='84' y='17' font-size='11' fill='#334155'>남</text>"
                    "<rect x='110' y='8' width='10' height='10' fill='#db2777'/><text x='124' y='17' font-size='11' fill='#334155'>여</text>"
                    "<rect x='150' y='8' width='10' height='10' fill='#94a3b8'/><text x='164' y='17' font-size='11' fill='#334155'>미입력/기타</text>"
                    "</g>"
                )
                + "</svg>"
            )

        def _gender_donut_svg(g: Dict[str, Any]) -> str:
            male = int(g.get("male", 0) or 0)
            female = int(g.get("female", 0) or 0)
            unknown = int(g.get("unknown", 0) or 0)
            total = max(1, male + female + unknown)
            male_pct = (male / total) * 100.0
            female_pct = (female / total) * 100.0
            unknown_pct = (unknown / total) * 100.0
            return (
                "<svg viewBox='0 0 420 280' width='100%' height='280' role='img' aria-label='성별 비중 도넛 차트'>"
                "<circle cx='170' cy='130' r='76' fill='none' stroke='#eef2ff' stroke-width='26'/>"
                f"<circle cx='170' cy='130' r='76' fill='none' stroke='#4f46e5' stroke-width='26' stroke-dasharray='{male_pct*4.78:.2f} 999' transform='rotate(-90 170 130)'/>"
                f"<circle cx='170' cy='130' r='76' fill='none' stroke='#db2777' stroke-width='26' stroke-dasharray='{female_pct*4.78:.2f} 999' transform='rotate({-90 + male_pct*3.6:.2f} 170 130)'/>"
                f"<circle cx='170' cy='130' r='76' fill='none' stroke='#94a3b8' stroke-width='26' stroke-dasharray='{unknown_pct*4.78:.2f} 999' transform='rotate({-90 + (male_pct+female_pct)*3.6:.2f} 170 130)'/>"
                "<circle cx='170' cy='130' r='52' fill='#fff'/>"
                f"<text x='300' y='96' font-size='13' fill='#4f46e5'>남 {male_pct:.0f}%</text>"
                f"<text x='300' y='122' font-size='13' fill='#db2777'>여 {female_pct:.0f}%</text>"
                f"<text x='300' y='148' font-size='13' fill='#64748b'>미입력/기타 {unknown_pct:.0f}%</text>"
                "</svg>"
            )

        monthly_rows = _rows(monthly, ["year_month", "headcount", "hires", "terminations"])
        dept_rows = _rows(by_department, ["department", "headcount"])
        emp_type_rows = _rows(by_emp_type, ["label", "count"])
        work_status_rows = _rows(by_work_status, ["label", "count"])
        nationality_rows = _rows(by_nationality, ["label", "count"])
        job_level_rows = _rows(by_job_level, ["label", "headcount", "avg_tenure_years"])
        position_rows = _rows(by_position, ["label", "headcount", "avg_tenure_years"])
        dept_workforce_rows = _rows(
            department_workforce,
            ["department", "headcount", "avg_age", "terminations_12m", "turnover_rate_pct"],
        )
        cohort_rows = _rows(
            hire_cohort_summary,
            ["hire_year", "hired_total", "still_active", "retention_pct"],
        )
        trend_svg = _line_chart_svg(monthly)
        age_gender_svg = _age_gender_svg(age_gender)
        gender_donut_svg = _gender_donut_svg(gender_totals)
        last_month = monthly[-1] if monthly else None
        net_change = 0
        if last_month:
            net_change = int(last_month.get("hires", 0) or 0) - int(last_month.get("terminations", 0) or 0)
        net_prefix = "+" if net_change >= 0 else ""

        return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HR Scheduled Report</title>
  <style>
    body {{ font-family: Arial, sans-serif; color:#111; margin:0; background:#f8fafc; }}
    .wrap {{ max-width: 1100px; margin: 0 auto; padding: 24px; }}
    .hero {{ background: linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; border-radius:14px; padding:20px; }}
    .badge {{ display:inline-block; font-size:11px; padding:4px 10px; border-radius:999px; background:rgba(255,255,255,.15); }}
    .subtitle {{ margin-top:8px; font-size:13px; color:#e9d5ff; max-width:780px; }}
    .insight {{ margin-top:14px; background:rgba(0,0,0,.15); border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px 10px; font-size:12px; }}
    .nav {{ margin-top:14px; display:flex; flex-wrap:wrap; gap:8px; }}
    .nav span {{ font-size:11px; color:#475569; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px; }}
    .kpi {{ display:flex; gap:12px; flex-wrap:wrap; margin-top:14px; }}
    .card {{ background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; flex:1; min-width:200px; }}
    .label {{ font-size:12px; color:#64748b; }}
    .value {{ font-size:28px; font-weight:700; margin-top:4px; }}
    h2 {{ margin:20px 0 8px; font-size:18px; }}
    .chart {{ background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; }}
    .grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
    @media (max-width: 900px) {{ .grid2 {{ grid-template-columns:1fr; }} }}
    .chartTitle {{ font-size:14px; font-weight:700; margin:0 0 6px; color:#0f172a; }}
    .chartHint {{ font-size:12px; color:#64748b; margin:0 0 8px; }}
    table {{ width:100%; border-collapse:collapse; background:#fff; border:1px solid #e2e8f0; }}
    th,td {{ border-bottom:1px solid #e2e8f0; padding:8px 10px; font-size:13px; text-align:left; }}
    th {{ background:#f1f5f9; }}
    .meta {{ margin-top:8px; font-size:12px; color:#e2e8f0; }}
    .empty {{ font-size:12px; color:#64748b; padding:10px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <span class="badge">HR Analytics</span>
      <h1 style="margin:8px 0 8px;">인사레포트</h1>
      <div class="subtitle">인력증감·고용/근무상태·직급/직책·인사연도 코호트·부서별 인력구조를 확인하고 액션플랜을 수립할 수 있습니다.</div>
      <div>회사명: {company_name} / 주기: {period_type} / 추이개월: {months}</div>
      <div class="meta">기준일: {as_of}</div>
      <div class="insight">최근 월 순변화: {last_month.get("year_month") if last_month else '-'} / {net_prefix}{net_change:,}명</div>
    </div>
    <div class="nav">
      <span>요약 지표</span><span>인력 추이</span><span>연령·성별</span><span>국적 분포</span><span>근속</span><span>조직</span><span>고용·근무</span><span>직급·직책</span><span>인사연도 코호트</span>
    </div>

    <div class="kpi">
      <div class="card"><div class="label">재직 인원</div><div class="value">{active:,}</div></div>
      <div class="card"><div class="label">전체 인원</div><div class="value">{all_emp:,}</div></div>
      <div class="card"><div class="label">재직 비율</div><div class="value">{active_rate_display}</div></div>
    </div>

    <h2>인원 증감 추이</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:8px;">월별 기준 재직/입사/퇴사 현황입니다.</div>
    <div class="chart">{trend_svg}</div>
    <table>
      <thead><tr><th>년월</th><th>재직</th><th>입사</th><th>퇴사</th></tr></thead>
      <tbody>{monthly_rows}</tbody>
    </table>

    <h2>부서별 인원</h2>
    <table>
      <thead><tr><th>부서</th><th>인원</th></tr></thead>
      <tbody>{dept_rows}</tbody>
    </table>

    <h2>고용구분 분포</h2>
    <table>
      <thead><tr><th>구분</th><th>인원</th></tr></thead>
      <tbody>{emp_type_rows}</tbody>
    </table>

    <h2>근무상태 분포</h2>
    <table>
      <thead><tr><th>구분</th><th>인원</th></tr></thead>
      <tbody>{work_status_rows}</tbody>
    </table>

    <div class="grid2" style="margin-top:20px;">
      <div class="chart">
        <p class="chartTitle">연령/성별 분포</p>
        <p class="chartHint">재직(status=active) 직원 기준입니다.</p>
        {age_gender_svg}
      </div>
      <div class="chart">
        <p class="chartTitle">성별 비중</p>
        <p class="chartHint">재직 직원 기준 성별 비율입니다.</p>
        {gender_donut_svg}
      </div>
    </div>

    <h2>국적 분포</h2>
    <table>
      <thead><tr><th>국적</th><th>인원</th></tr></thead>
      <tbody>{nationality_rows}</tbody>
    </table>

    <h2>직급 분포(평균 근속연수)</h2>
    <table>
      <thead><tr><th>직급</th><th>인원</th><th>평균 근속(년)</th></tr></thead>
      <tbody>{job_level_rows}</tbody>
    </table>

    <h2>직책 분포(평균 근속연수)</h2>
    <table>
      <thead><tr><th>직책</th><th>인원</th><th>평균 근속(년)</th></tr></thead>
      <tbody>{position_rows}</tbody>
    </table>

    <h2>부서 인력 상세(평균연령/12개월 퇴직/이직률)</h2>
    <table>
      <thead><tr><th>부서</th><th>인원</th><th>평균연령</th><th>퇴직(12M)</th><th>이직률%</th></tr></thead>
      <tbody>{dept_workforce_rows}</tbody>
    </table>

    <h2>입사 코호트 요약</h2>
    <table>
      <thead><tr><th>입사연도</th><th>입사자수</th><th>현재 재직</th><th>유지율%</th></tr></thead>
      <tbody>{cohort_rows}</tbody>
    </table>
  </div>
</body>
</html>"""

    def _run_attendance_report_pdf_email(self, actor: User, company_id: Optional[int], payload: Dict[str, Any]) -> Dict[str, Any]:
        recipient_emails = payload.get("recipient_emails") or []
        if isinstance(recipient_emails, str):
            recipient_emails = [x.strip() for x in recipient_emails.split(",") if x.strip()]
        if not recipient_emails:
            raise ValueError("수신자 이메일이 없습니다.")
        run_on_day = int(payload.get("run_on_day") or 0)
        if run_on_day > 0 and date.today().day != run_on_day:
            return {"skipped": True, "reason": f"run_on_day={run_on_day} 불일치"}
        period_type = str(payload.get("period_type") or "daily").strip().lower()
        report_format = str(payload.get("report_format") or "pdf").strip().lower()
        months = max(1, int(payload.get("months") or 12))
        company_name = self._company_display_name(company_id)

        today = date.today()
        if period_type == "monthly":
            date_from = date(today.year, today.month, 1)
        else:
            date_from = today
        date_to = today

        summary = AttendanceTimeDayService(self.db).ot_allowance_report_summary(
            actor,
            company_id=company_id,
            employee_id=None,
            department=None,
            status="all",
            search=None,
            search_field=None,
            search_value=None,
            date_from=date_from,
            date_to=date_to,
        )
        lines = [
            f"회사명: {company_name}",
            f"기간유형: {period_type}",
            f"집계기간: {date_from.isoformat()} ~ {date_to.isoformat()}",
            f"원천 건수: {int(summary.get('source_row_count') or 0)}",
            f"OT 합계(분): {int(summary.get('ot_buckets', {}).get('oth1', 0)) + int(summary.get('ot_buckets', {}).get('oth2', 0)) + int(summary.get('ot_buckets', {}).get('oth3', 0)) + int(summary.get('ot_buckets', {}).get('oth4', 0)) + int(summary.get('ot_buckets', {}).get('oth5', 0)) + int(summary.get('ot_buckets', {}).get('oth6', 0))}",
            f"OT 금액(바트): {float(summary.get('ot_buckets', {}).get('othb', 0))}",
            f"부서 집계 수: {len(summary.get('by_department') or [])}",
            f"추이분석 개월 수: {months}",
        ]
        report_dir = Path("storage") / "scheduled_reports"
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        if report_format == "html":
            report_name = f"attendance_report_{ts}.html"
            report_path = str(report_dir / report_name)
            Path(report_path).parent.mkdir(parents=True, exist_ok=True)
            html = "<html><body><h1>Attendance Scheduled Report</h1>" + "".join(
                f"<p>{x}</p>" for x in lines
            ) + "</body></html>"
            Path(report_path).write_text(html, encoding="utf-8")
        else:
            report_name = f"attendance_report_{ts}.pdf"
            report_path = write_simple_text_pdf(str(report_dir / report_name), "Attendance Scheduled Report", lines)
        subject = "[HR AI AGENT] 근태 리포트"
        body = "예약 실행된 근태 리포트를 첨부합니다."
        for email in recipient_emails:
            send_email(email, subject, body, attachment=report_path)
        return {"report_path": report_path, "report_format": report_format, "recipients": recipient_emails}
