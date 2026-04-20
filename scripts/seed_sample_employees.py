"""Seed sample employee master records (인사기본정보 + 개인정보) + optional photos.

Uses existing companies, employee_reference_items, and value pools from current DB rows.

Usage:
  python scripts/seed_sample_employees.py
  python scripts/seed_sample_employees.py --count 1000
  python scripts/seed_sample_employees.py --count 500 --skip-photos
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

# Ensure "app" package import works when executed as a script.
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app.config import settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.employee import Employee
from app.models.employee_personal_info import EmployeePersonalInfo
from app.models.employee_reference_item import EmployeeReferenceItem
from app.services.employee_photo_storage import save_employee_photo_processed_sync


FIRST_NAMES_EN = [
    "Minjun",
    "Seo-yeon",
    "Jiho",
    "Yuna",
    "Taehyun",
    "Haneul",
    "Jisoo",
    "Sumin",
    "Doyun",
    "Hyerin",
]
LAST_NAMES_EN = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon"]
# Korean 표기(성+이름) — name 컬럼
KOR_SUR = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"]
KOR_GIVEN = [
    "민준",
    "서연",
    "지호",
    "유나",
    "태현",
    "하늘",
    "지수",
    "수민",
    "도윤",
    "혜린",
    "은우",
    "서준",
    "예준",
    "시우",
    "주원",
]
SUR_TO_EN = dict(zip(KOR_SUR, ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim"]))
NICKNAMES = ["MJ", "SY", "JH", "YN", "TH", "HN", "JS", "SM", "DY", "HR"]
RACES = ["Asian", "Korean", "Thai", "Mixed"]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
MILITARY = ["completed", "exempt", "not_applicable", "deferred"]
HOBBIES = ["Reading", "Running", "Cooking", "Travel", "Music", "Cycling"]
SPORTS = ["Football", "Badminton", "Swimming", "Basketball", "Jogging"]

AVATAR_FETCH_TIMEOUT_SEC = 15


def random_birth_date() -> date:
    # 1980-01-01 ~ 2002-12-31
    start = date(1980, 1, 1)
    end = date(2002, 12, 31)
    days = (end - start).days
    return start + timedelta(days=random.randint(0, days))


def random_hire_date() -> date:
    # 2017-01-01 ~ today
    start = date(2017, 1, 1)
    end = date.today()
    days = max((end - start).days, 1)
    return start + timedelta(days=random.randint(0, days))


def build_employee_number(seq: int) -> str:
    return f"SMP{seq:05d}"


def get_company_rows(db: Session) -> list[tuple[int, str]]:
    rows = db.query(Company.id, Company.company_code).order_by(Company.id.asc()).all()
    if rows:
        return [(int(i), (c or "").strip() or f"_company_{i}") for i, c in rows]
    fallback_ids = [
        int(cid)
        for (cid,) in db.query(Employee.company_id)
        .filter(Employee.company_id.isnot(None))
        .distinct()
        .all()
    ]
    return [(cid, f"_company_{cid}") for cid in fallback_ids]


def company_folder_for_row(company_id: int, code_by_id: dict[int, str]) -> str:
    return code_by_id.get(company_id) or f"_company_{company_id}"


def get_reference_pools(db: Session) -> dict[str, list[str]]:
    rows = (
        db.query(
            Employee.department,
            Employee.position,
            Employee.job_level,
            Employee.employment_type,
            Employee.division,
            Employee.work_place,
            Employee.area,
            Employee.work_status,
            Employee.employee_level,
            Employee.currency,
            EmployeePersonalInfo.nationality,
            EmployeePersonalInfo.religion,
        )
        .outerjoin(EmployeePersonalInfo, EmployeePersonalInfo.employee_id == Employee.id)
        .all()
    )

    def collect(idx: int, fallback: list[str]) -> list[str]:
        vals = sorted({str(r[idx]).strip() for r in rows if r[idx] is not None and str(r[idx]).strip()})
        return vals if vals else fallback

    return {
        "currency": collect(9, ["THB"]),
        "nationality": collect(10, ["KR", "TH"]),
        "religion": collect(11, ["BUD", "CHR"]),
    }


def get_company_ref_items(
    db: Session, company_ids: list[int]
) -> dict[int, dict[str, list[tuple[int, str]]]]:
    """company_id → category → [(item_id, code), ...]"""
    rows = (
        db.query(
            EmployeeReferenceItem.id,
            EmployeeReferenceItem.company_id,
            EmployeeReferenceItem.category,
            EmployeeReferenceItem.code,
        )
        .filter(EmployeeReferenceItem.company_id.in_(company_ids))
        .all()
    )
    out: dict[int, dict[str, list[tuple[int, str]]]] = {}
    for item_id, company_id, category, code in rows:
        out.setdefault(int(company_id), {}).setdefault(str(category), []).append(
            (int(item_id), str(code))
        )
    return out


def pick_ref(
    refs: dict[str, list[tuple[int, str]]],
    category: str,
) -> tuple[int | None, str | None]:
    items = refs.get(category, [])
    if not items:
        return None, None
    item_id, code = random.choice(items)
    return item_id, code


def fetch_avatar_jpeg_bytes(seed: int) -> bytes | None:
    """Deterministic placeholder portrait (외부 서비스 — 오프라인이면 None)."""
    url = f"https://i.pravatar.cc/512?u={seed}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HRSeedScript/1.0"})
        with urllib.request.urlopen(req, timeout=AVATAR_FETCH_TIMEOUT_SEC) as resp:
            return resp.read()
    except (urllib.error.URLError, OSError, ValueError):
        return None


def seed(count: int, *, with_photos: bool) -> None:
    db = SessionLocal()
    storage = settings.STORAGE_PATH or "./storage"
    photo_ok = 0
    photo_fail = 0
    try:
        company_rows = get_company_rows(db)
        if not company_rows:
            raise RuntimeError("Company data not found. Please create at least one company first.")

        company_ids = [c for c, _ in company_rows]
        code_by_id = dict(company_rows)

        pools = get_reference_pools(db)
        refs_by_company = get_company_ref_items(db, company_ids)

        max_existing = db.query(func.max(Employee.id)).scalar() or 0
        created = 0
        batch_every = 50

        for i in range(1, count + 1):
            seq = max_existing + i
            emp_no = build_employee_number(seq)
            email = f"sample.emp.{seq}@example.local"

            exists = (
                db.query(Employee.id)
                .filter((Employee.employee_number == emp_no) | (Employee.email == email))
                .first()
            )
            if exists:
                continue

            ks = random.choice(KOR_SUR)
            kg = random.choice(KOR_GIVEN)
            name_kor = f"{ks}{kg}"
            first_en = random.choice(FIRST_NAMES_EN)
            last_en = SUR_TO_EN.get(ks, random.choice(LAST_NAMES_EN))
            name_en = f"{last_en} {first_en}"
            nickname = random.choice(NICKNAMES)

            company_id = random.choice(company_ids)
            refs = refs_by_company.get(company_id, {})

            dept_iid, dept_code = pick_ref(refs, "department")
            pos_iid, pos_code = pick_ref(refs, "position")
            lvl_iid, lvl_code = pick_ref(refs, "level")
            empt_iid, empt_code = pick_ref(refs, "employment_type")
            sal_iid, sal_code = pick_ref(refs, "employee_type")
            div_iid, div_code = pick_ref(refs, "division")
            wp_iid, wp_code = pick_ref(refs, "work_place")
            ar_iid, ar_code = pick_ref(refs, "area")
            ws_iid, ws_code = pick_ref(refs, "work_status")
            el_iid, el_code = pick_ref(refs, "employee_level")

            e = Employee(
                company_id=company_id,
                employee_number=emp_no,
                name=name_kor,
                name_en=name_en,
                email=email,
                phone=f"010-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
                department=dept_code,
                department_item_id=dept_iid,
                position=pos_code,
                position_item_id=pos_iid,
                job_level=lvl_code,
                job_level_item_id=lvl_iid,
                hire_date=random_hire_date(),
                employment_type=empt_code,
                employment_type_item_id=empt_iid,
                salary_process_type=sal_code,
                salary_process_type_item_id=sal_iid,
                division=div_code,
                division_item_id=div_iid,
                work_place=wp_code,
                work_place_item_id=wp_iid,
                area=ar_code,
                area_item_id=ar_iid,
                work_status=ws_code,
                work_status_item_id=ws_iid,
                employee_level=el_code,
                employee_level_item_id=el_iid,
                status="active",
                currency=random.choice(pools["currency"]),
                birth_date=random_birth_date(),
                gender=random.choice(["male", "female"]),
            )
            db.add(e)
            db.flush()

            if with_photos:
                raw = fetch_avatar_jpeg_bytes(e.id)
                if raw:
                    try:
                        folder = company_folder_for_row(company_id, code_by_id)
                        rel_main, _ = save_employee_photo_processed_sync(
                            raw,
                            storage_path=storage,
                            employee_id=e.id,
                            company_folder=folder,
                        )
                        e.photo_path = rel_main
                        photo_ok += 1
                    except ValueError:
                        photo_fail += 1
                else:
                    photo_fail += 1

            p = EmployeePersonalInfo(
                employee_id=e.id,
                nickname=nickname,
                place_of_birth=random.choice(["Seoul", "Busan", "Bangkok", "Chiang Mai"]),
                height_cm=random.randint(155, 185),
                weight_kg=random.randint(48, 90),
                race=random.choice(RACES),
                nationality=random.choice(pools["nationality"]),
                religion=random.choice(pools["religion"]),
                blood_group=random.choice(BLOOD_GROUPS),
                personal_tel=f"010-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
                personal_email=f"sample.personal.{seq}@example.local",
                website=f"https://sample-{seq}.local",
                military_status=random.choice(MILITARY),
                personal_notes="Seeded sample employee (bulk)",
                hobby=random.choice(HOBBIES),
                sports=random.choice(SPORTS),
                typing_thai_wpm=random.randint(20, 60),
                typing_english_wpm=random.randint(20, 70),
                has_driving_license=random.choice([True, False]),
                driving_license_number=f"D{seq:07d}",
                own_car=random.choice([True, False]),
                has_motorcycle_license=random.choice([True, False]),
                motorcycle_license_number=f"M{seq:07d}",
                own_motorcycle=random.choice([True, False]),
            )
            db.add(p)
            created += 1

            if created % batch_every == 0:
                db.commit()

        db.commit()
        msg = f"Seed complete: requested={count}, created={created}, storage={storage!r}"
        if with_photos:
            msg += f", photos_ok={photo_ok}, photos_skipped_or_failed={photo_fail}"
        print(msg)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed sample employee master data")
    parser.add_argument(
        "--count",
        type=int,
        default=1000,
        help="Number of sample employees to create (default: 1000)",
    )
    parser.add_argument(
        "--skip-photos",
        action="store_true",
        help="Do not download/store profile images (faster; photo_path stays null).",
    )
    args = parser.parse_args()
    seed(max(args.count, 1), with_photos=not args.skip_photos)


if __name__ == "__main__":
    main()
