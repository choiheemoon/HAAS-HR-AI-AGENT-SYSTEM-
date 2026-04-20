"""직원 연도별 연차 잔액 서비스."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_annual_leave_balance import EmployeeAnnualLeaveBalance
from app.models.employee_attendance_master import (
    EmployeeAttendanceLeaveBalance,
    EmployeeAttendanceMaster,
)
from app.models.user import User
from app.services.master_data.master_data_service import MasterDataService
from app.services.system_rbac_service import SystemRbacService


def _int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None


def _str(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _d(v: Optional[date]) -> Optional[str]:
    return v.isoformat() if v else None


def _parse_date(v: Any) -> Optional[date]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _service_days_on(hire_date: Optional[date], base_date: date) -> int:
    if not hire_date:
        return 0
    if base_date < hire_date:
        return 0
    return (base_date - hire_date).days


def _meets_min_service_years(hire_date: Optional[date], base_date: date, min_service_years: float) -> bool:
    """기준일(base_date) 시점에 최소 재직연수를 충족하는지 판정.

    - 입사일이 없거나 기준일이 입사 전이면 미충족.
    - min_service_years <= 0 이면 누구나 충족으로 본다.
    - 정수 연(예: 1.0)은 입사일 + N년 맞춤일(날짜 기준)로 판정(연차관리 UI의 '최소 재직연수'와 동일).
    - 소수 연(예: 1.5)은 일수로 근사: ceil(min_service_years * 365) 대신 기존과 맞추기 위해 round(*365).
    """
    if min_service_years <= 0:
        return True
    if not hire_date:
        return False
    if base_date < hire_date:
        return False
    years = float(min_service_years)
    frac = abs(years - round(years))
    if frac < 1e-9:
        n = int(round(years))
        anniversary = hire_date + relativedelta(years=n)
        return base_date >= anniversary
    min_days = max(0, int(round(years * 365)))
    return (base_date - hire_date).days >= min_days


def _service_reference_date_for_year(leave_year: int) -> date:
    today = date.today()
    if leave_year < today.year:
        return date(leave_year, 12, 31)
    if leave_year > today.year:
        return date(leave_year, 1, 1)
    return today


def _row_to_dict(r: EmployeeAnnualLeaveBalance) -> Dict[str, Any]:
    return {
        "id": int(r.id),
        "employee_id": r.employee_id,
        "company_id": r.company_id,
        "leave_year": r.leave_year,
        "base_date": _d(r.base_date),
        "service_days": r.service_days,
        "generated_days": r.generated_days,
        "prev_days": r.prev_days,
        "prev_hours": r.prev_hours,
        "prev_minutes": r.prev_minutes,
        "transferred_days": r.transferred_days,
        "transferred_hours": r.transferred_hours,
        "transferred_minutes": r.transferred_minutes,
        "used_days": r.used_days,
        "used_hours": r.used_hours,
        "used_minutes": r.used_minutes,
        "year_days": r.year_days,
        "year_hours": r.year_hours,
        "year_minutes": r.year_minutes,
        "level_of_leave": r.level_of_leave,
        "compensate_accumulated": r.compensate_accumulated,
    }


class EmployeeAnnualLeaveBalanceService:
    def __init__(self, db: Session):
        self.db = db

    def _merged_annual_leave_payload(self, emp: Employee, y: int) -> Dict[str, Any]:
        """연차 잔액 테이블 + 해당 연도 근태마스터 휴가 잔액 병합(연차관리 목록과 동일 규칙)."""
        service_base_date = _service_reference_date_for_year(y)
        master_leave = (
            self.db.query(EmployeeAttendanceLeaveBalance)
            .join(
                EmployeeAttendanceMaster,
                EmployeeAttendanceMaster.id == EmployeeAttendanceLeaveBalance.master_id,
            )
            .filter(
                EmployeeAttendanceMaster.employee_id == emp.id,
                EmployeeAttendanceLeaveBalance.leave_year == y,
            )
            .first()
        )
        bal = (
            self.db.query(EmployeeAnnualLeaveBalance)
            .filter(
                EmployeeAnnualLeaveBalance.employee_id == emp.id,
                EmployeeAnnualLeaveBalance.leave_year == y,
            )
            .first()
        )
        if bal:
            item = _row_to_dict(bal)
            item["service_days"] = _service_days_on(emp.hire_date, service_base_date)
            if master_leave is not None:
                item["prev_days"] = master_leave.prev_days
                item["prev_hours"] = master_leave.prev_hours
                item["prev_minutes"] = master_leave.prev_minutes
                item["transferred_days"] = master_leave.transferred_days
                item["transferred_hours"] = master_leave.transferred_hours
                item["transferred_minutes"] = master_leave.transferred_minutes
                # 연차 잔액 행이 있으면 발생/사용 일수는 연차관리(employee_annual_leave_balance)가 기준이다.
                # 근태마스터 leave_balance.used_* 는 연차와 무관한 값이 섞이거나 과거 데이터로 남아
                # year_days(연차관리)와 불일치하는 경우가 있어 덮어쓰지 않는다.
                item["level_of_leave"] = master_leave.level_of_leave
                item["compensate_accumulated"] = master_leave.compensate_accumulated
            return item
        item = {
            "id": None,
            "employee_id": emp.id,
            "company_id": emp.company_id,
            "leave_year": y,
            "base_date": f"{y}-01-01",
            "service_days": _service_days_on(emp.hire_date, service_base_date),
            "generated_days": 0,
            "prev_days": 0,
            "prev_hours": 0,
            "prev_minutes": 0,
            "transferred_days": 0,
            "transferred_hours": 0,
            "transferred_minutes": 0,
            "used_days": 0,
            "used_hours": 0,
            "used_minutes": 0,
            "year_days": 0,
            "year_hours": 0,
            "year_minutes": 0,
            "level_of_leave": "",
            "compensate_accumulated": "",
        }
        if master_leave is not None:
            item["prev_days"] = master_leave.prev_days
            item["prev_hours"] = master_leave.prev_hours
            item["prev_minutes"] = master_leave.prev_minutes
            item["transferred_days"] = master_leave.transferred_days
            item["transferred_hours"] = master_leave.transferred_hours
            item["transferred_minutes"] = master_leave.transferred_minutes
            item["used_days"] = master_leave.used_days
            item["used_hours"] = master_leave.used_hours
            item["used_minutes"] = master_leave.used_minutes
            item["year_days"] = master_leave.year_days
            item["year_hours"] = master_leave.year_hours
            item["year_minutes"] = master_leave.year_minutes
            item["level_of_leave"] = master_leave.level_of_leave or ""
            item["compensate_accumulated"] = master_leave.compensate_accumulated or ""
            item["generated_days"] = master_leave.year_days or 0
        return item

    def _allowed_company_ids(self, user: User) -> List[int]:
        return SystemRbacService(self.db).get_user_company_ids(user.id, current_user=user)

    def _require_employee(self, employee_id: int, user: User) -> Employee:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        emp = MasterDataService(self.db).get_employee(employee_id)
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        if emp.company_id is not None and emp.company_id not in allowed:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def list_for_company_year(
        self,
        company_id: Optional[int],
        leave_year: int,
        user: User,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        department: Optional[str] = None,
        status: str = "active",
    ) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        p = max(1, int(page))
        ps = max(1, min(int(page_size), 200))
        if not allowed:
            return {"items": [], "total": 0, "page": p, "page_size": ps}

        if company_id is not None:
            if company_id not in allowed:
                raise ValueError("해당 회사에 접근할 수 없습니다.")
            company_ids: List[int] = [company_id]
        else:
            company_ids = list(allowed)

        y = int(leave_year)
        q_emp = self.db.query(Employee).filter(Employee.company_id.in_(company_ids))

        st = (status or "active").strip().lower()
        if st in ("active", "terminated", "inactive"):
            q_emp = q_emp.filter(func.coalesce(Employee.status, "active") == st)
        elif st != "all":
            q_emp = q_emp.filter(func.coalesce(Employee.status, "active") == "active")

        dep = (department or "").strip()
        if dep:
            q_emp = q_emp.filter(func.coalesce(Employee.department, "") == dep)

        kw = (search or "").strip()
        if kw:
            like = f"%{kw}%"
            q_emp = q_emp.filter(
                or_(
                    Employee.name.ilike(like),
                    Employee.employee_number.ilike(like),
                    Employee.department.ilike(like),
                )
            )

        total = q_emp.count()
        rows = (
            q_emp.order_by(Employee.company_id.asc(), Employee.employee_number.asc(), Employee.id.asc())
            .offset((p - 1) * ps)
            .limit(ps)
            .all()
        )

        items: List[Dict[str, Any]] = []
        for emp in rows:
            item = self._merged_annual_leave_payload(emp, y)
            item["employee_number"] = emp.employee_number
            item["employee_name"] = emp.name
            item["employee_department"] = emp.department
            item["employee_status"] = emp.status or "active"
            item["hire_date"] = _d(emp.hire_date)
            items.append(item)

        return {
            "items": items,
            "total": total,
            "page": p,
            "page_size": ps,
        }

    def get_by_employee_year(self, employee_id: int, leave_year: int, user: User) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        y = int(leave_year)
        return self._merged_annual_leave_payload(emp, y)

    def upsert_by_employee_year(self, employee_id: int, leave_year: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        y = int(leave_year)
        row = (
            self.db.query(EmployeeAnnualLeaveBalance)
            .filter(
                EmployeeAnnualLeaveBalance.employee_id == employee_id,
                EmployeeAnnualLeaveBalance.leave_year == y,
            )
            .first()
        )
        now = datetime.utcnow()
        if not row:
            row = EmployeeAnnualLeaveBalance(
                employee_id=emp.id,
                company_id=emp.company_id,
                leave_year=y,
                created_at=now,
                updated_at=now,
            )
            self.db.add(row)

        row.company_id = emp.company_id
        row.leave_year = y
        row.base_date = date(y, 1, 1)
        row.service_days = _service_days_on(emp.hire_date, row.base_date)

        for k in (
            "generated_days",
            "prev_days",
            "prev_hours",
            "prev_minutes",
            "transferred_days",
            "transferred_hours",
            "transferred_minutes",
            "used_days",
            "used_hours",
            "used_minutes",
            "year_days",
            "year_hours",
            "year_minutes",
        ):
            if k in body:
                setattr(row, k, _int(body.get(k)))
        if "level_of_leave" in body:
            row.level_of_leave = _str(body.get("level_of_leave"))
        if "compensate_accumulated" in body:
            row.compensate_accumulated = _str(body.get("compensate_accumulated"))
        row.updated_at = now

        self.db.commit()
        self.db.refresh(row)
        return _row_to_dict(row)

    def bulk_generate(self, leave_year: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        y = int(leave_year)
        base_date = _parse_date(body.get("base_date")) or date(y, 1, 1)
        min_service_years = float(body.get("min_service_years", 1))
        grant_days = int(body.get("grant_days", 6))
        under_days = int(body.get("under_min_service_grant_days", 0))
        overwrite_existing = bool(body.get("overwrite_existing", False))

        target_company_id = _int(body.get("company_id"))
        allowed = self._allowed_company_ids(user)
        if not allowed:
            return {"leave_year": y, "processed": 0, "created": 0, "updated": 0, "skipped_existing": 0}
        if target_company_id is not None and target_company_id not in allowed:
            raise ValueError("해당 회사에 접근할 수 없습니다.")

        q = self.db.query(Employee)
        if target_company_id is not None:
            q = q.filter(Employee.company_id == target_company_id)
        else:
            q = q.filter(Employee.company_id.in_(allowed))
        employees = q.all()

        created = 0
        updated = 0
        skipped_existing = 0
        for emp in employees:
            service_days = _service_days_on(emp.hire_date, base_date)
            meets = _meets_min_service_years(emp.hire_date, base_date, min_service_years)
            generated_days = grant_days if meets else under_days
            row = (
                self.db.query(EmployeeAnnualLeaveBalance)
                .filter(
                    EmployeeAnnualLeaveBalance.employee_id == emp.id,
                    EmployeeAnnualLeaveBalance.leave_year == y,
                )
                .first()
            )
            if row is None:
                row = EmployeeAnnualLeaveBalance(
                    employee_id=emp.id,
                    company_id=emp.company_id,
                    leave_year=y,
                    base_date=base_date,
                    service_days=service_days,
                    generated_days=generated_days,
                    year_days=generated_days,
                    year_hours=0,
                    year_minutes=0,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self.db.add(row)
                created += 1
                continue

            if not overwrite_existing:
                skipped_existing += 1
                continue

            row.company_id = emp.company_id
            row.base_date = base_date
            row.service_days = service_days
            row.generated_days = generated_days
            row.year_days = generated_days
            row.year_hours = 0
            row.year_minutes = 0
            row.updated_at = datetime.utcnow()
            updated += 1

        self.db.commit()
        return {
            "leave_year": y,
            "company_id": target_company_id,
            "processed": len(employees),
            "created": created,
            "updated": updated,
            "skipped_existing": skipped_existing,
            "config": {
                "base_date": base_date.isoformat(),
                "min_service_years": min_service_years,
                "grant_days": grant_days,
                "under_min_service_grant_days": under_days,
                "overwrite_existing": overwrite_existing,
                "eligibility_rule": (
                    "기준일 전 미입사(기준일 < 입사일) 또는 최소 재직연수 미달 시 under_min_service_grant_days, "
                    "그 외 grant_days. 정수 최소 연수는 입사일+N년 맞춤일 이후인지로 판정."
                ),
            },
        }
