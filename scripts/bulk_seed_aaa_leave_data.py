from __future__ import annotations

from datetime import date, timedelta
import random

from app.database import SessionLocal
from app.models.attendance import Leave, LeaveStatus
from app.models.company import Company
from app.models.employee import Employee
from app.models.employee_attendance_master import (
    EmployeeAttendanceLeaveBalance,
    EmployeeAttendanceMaster,
)


TARGET_COMPANY_CODE = "AAA"
TARGET_YEAR = date.today().year
SEED = 20260410

# 첨부 화면의 "휴가 등급 1~6" 흐름에 맞춘 기본 부여 일수
BASE_ENTITLEMENT_BY_LEVEL = {
    1: 6,
    2: 8,
    3: 10,
    4: 12,
    5: 15,
    6: 18,
}


def ensure_master_and_leave_balance(
    db,
    employee_id: int,
    company_id: int,
) -> tuple[EmployeeAttendanceMaster, EmployeeAttendanceLeaveBalance]:
    master = db.query(EmployeeAttendanceMaster).filter(EmployeeAttendanceMaster.employee_id == employee_id).first()
    if master is None:
        master = EmployeeAttendanceMaster(employee_id=employee_id, company_id=company_id)
        db.add(master)
        db.flush()
    elif master.company_id != company_id:
        master.company_id = company_id

    lb = (
        db.query(EmployeeAttendanceLeaveBalance)
        .filter(EmployeeAttendanceLeaveBalance.master_id == master.id)
        .first()
    )
    if lb is None:
        lb = EmployeeAttendanceLeaveBalance(master_id=master.id)
        db.add(lb)
        db.flush()
    return master, lb


def seed_leave_balance(lb: EmployeeAttendanceLeaveBalance, level: int, rng: random.Random) -> None:
    base = BASE_ENTITLEMENT_BY_LEVEL[level]
    prev_days = rng.randint(0, 3)
    transferred_days = rng.randint(0, 2)
    used_days = rng.randint(0, max(1, base // 2))
    year_days = max(0, base + prev_days + transferred_days - used_days)

    lb.leave_year = TARGET_YEAR
    lb.level_of_leave = str(level)
    lb.compensate_accumulated = f"{rng.randint(0, 10):02d}:{rng.choice([0, 10, 20, 30, 40, 50]):02d}"

    lb.prev_days = prev_days
    lb.prev_hours = 0
    lb.prev_minutes = 0

    lb.transferred_days = transferred_days
    lb.transferred_hours = 0
    lb.transferred_minutes = 0

    lb.used_days = used_days
    lb.used_hours = 0
    lb.used_minutes = 0

    lb.year_days = year_days
    lb.year_hours = 0
    lb.year_minutes = 0


def seed_leave_records_if_missing(db, employee_id: int, level: int, rng: random.Random) -> int:
    existing_count = (
        db.query(Leave)
        .filter(
            Leave.employee_id == employee_id,
            Leave.start_date >= date(TARGET_YEAR, 1, 1),
            Leave.start_date <= date(TARGET_YEAR, 12, 31),
        )
        .count()
    )
    if existing_count > 0:
        return 0

    leave_types = ["annual", "sick", "personal", "other"]
    created = 0
    row_count = rng.randint(2, 4)
    for i in range(row_count):
        month = rng.randint(1, 12)
        day = rng.randint(1, 25)
        start = date(TARGET_YEAR, month, day)
        days = 1 if i % 3 else 0.5
        end = start + timedelta(days=0 if days <= 1 else int(days - 1))
        row = Leave(
            employee_id=employee_id,
            leave_type=rng.choice(leave_types),
            start_date=start,
            end_date=end,
            days=float(days),
            status=LeaveStatus.APPROVED.value,
            reason=f"seeded-{TARGET_YEAR}-L{level}",
        )
        db.add(row)
        created += 1
    return created


def main() -> None:
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.company_code == TARGET_COMPANY_CODE).first()
        if company is None:
            raise RuntimeError(f"Company code '{TARGET_COMPANY_CODE}' not found.")

        employees = (
            db.query(Employee)
            .filter(Employee.company_id == company.id)
            .order_by(Employee.id.asc())
            .all()
        )
        if not employees:
            print(f"No employees in company={company.id} ({company.company_code})")
            return

        rng = random.Random(SEED)
        created_master = 0
        created_balance = 0
        seeded_leave_rows = 0

        for idx, emp in enumerate(employees):
            master_before = (
                db.query(EmployeeAttendanceMaster)
                .filter(EmployeeAttendanceMaster.employee_id == emp.id)
                .first()
            )
            lb_before = None
            if master_before is not None:
                lb_before = (
                    db.query(EmployeeAttendanceLeaveBalance)
                    .filter(EmployeeAttendanceLeaveBalance.master_id == master_before.id)
                    .first()
                )

            _, lb = ensure_master_and_leave_balance(db, emp.id, company.id)
            if master_before is None:
                created_master += 1
            if lb_before is None:
                created_balance += 1

            level = (idx % 6) + 1
            seed_leave_balance(lb, level, rng)
            seeded_leave_rows += seed_leave_records_if_missing(db, emp.id, level, rng)

            if (idx + 1) % 500 == 0:
                db.commit()
                print(f"processed={idx + 1}/{len(employees)}")

        db.commit()
        print(
            "DONE",
            {
                "company_id": company.id,
                "company_code": company.company_code,
                "employee_count": len(employees),
                "created_master": created_master,
                "created_leave_balance": created_balance,
                "seeded_leave_rows": seeded_leave_rows,
                "year": TARGET_YEAR,
                "level_rule": "1~6 round-robin",
            },
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
