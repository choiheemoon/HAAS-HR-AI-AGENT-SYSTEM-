from __future__ import annotations

from sqlalchemy import func, text

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceShiftGroupMaster


GROUP_NAMES = [
    "Office A",
    "Pro A",
    "Pro B",
    "Training KR",
    "Support TSE",
    "Office B",
    "Day shift Injection",
    "Trainee",
    "Day shift Mold",
]


def main():
    db = SessionLocal()
    try:
        company_id = db.execute(
            text("select id from companies where company_code = :code order by id limit 1"),
            {"code": "AAA"},
        ).scalar()
        if not company_id:
            raise RuntimeError("company_code='AAA' 회사를 찾을 수 없습니다.")

        for i, name in enumerate(GROUP_NAMES):
            nm = name.strip()
            if not nm:
                continue
            row = (
                db.query(AttendanceShiftGroupMaster)
                .filter(
                    AttendanceShiftGroupMaster.company_id == company_id,
                    func.lower(func.trim(AttendanceShiftGroupMaster.name)) == nm.lower(),
                )
                .first()
            )
            if row is None:
                row = AttendanceShiftGroupMaster(company_id=company_id, name=nm)
                db.add(row)
                db.flush()
            row.name = nm
            row.sort_order = i
            if row.description is None:
                row.description = ""

        db.commit()
        print(f"imported shift groups for company_id={company_id}: {len(GROUP_NAMES)} rows")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

