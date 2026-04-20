"""직원 증명사진 백필: photo_path 가 비어 있는 모든 행에 대해 저장소에 JPEG·썸네일을 생성합니다.

Usage:
  python scripts/backfill_employee_photos.py
  python scripts/backfill_employee_photos.py --workers N
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from sqlalchemy import or_

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app.config import settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.employee import Employee
from app.services.employee_photo_storage import save_employee_photo_processed_sync

AVATAR_FETCH_TIMEOUT_SEC = 20
BATCH_COMMIT = 50


def get_company_code_map_from_db(db) -> dict[int, str]:
    rows = db.query(Company.id, Company.company_code).all()
    return {int(i): ((c or "").strip() or f"_company_{i}") for i, c in rows}


def company_folder(company_id: Optional[int], code_by_id: dict[int, str]) -> str:
    if company_id is None:
        return "_no_company"
    return code_by_id.get(company_id) or f"_company_{company_id}"


def fetch_avatar_bytes(seed: int) -> Optional[bytes]:
    url = f"https://i.pravatar.cc/512?u={seed}"
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HRBackfillPhotos/1.0"})
            with urllib.request.urlopen(req, timeout=AVATAR_FETCH_TIMEOUT_SEC) as resp:
                data = resp.read()
                if data:
                    return data
        except (urllib.error.URLError, OSError, ValueError):
            pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill employee photos for rows missing photo_path")
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel download threads (default: 8)",
    )
    args = parser.parse_args()
    workers = max(1, min(args.workers, 32))

    storage = settings.STORAGE_PATH or "./storage"
    db = SessionLocal()
    ok = 0
    fail = 0
    try:
        code_by_id = get_company_code_map_from_db(db)
        pending = (
            db.query(Employee.id, Employee.company_id)
            .filter(or_(Employee.photo_path.is_(None), Employee.photo_path == ""))
            .order_by(Employee.id)
            .all()
        )
        pending_list = list(pending)
        total = len(pending_list)
        if not total:
            print("No employees need photos.")
            return

        print(f"Backfill: {total} employees, storage={storage!r}, workers={workers}")

        def load_one(row: tuple[int, Optional[int]]) -> tuple[int, Optional[int], Optional[bytes]]:
            emp_id, co_id = row
            return emp_id, co_id, fetch_avatar_bytes(emp_id)

        for i in range(0, total, BATCH_COMMIT):
            chunk = pending_list[i : i + BATCH_COMMIT]
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futures = [ex.submit(load_one, row) for row in chunk]
                for fut in as_completed(futures):
                    emp_id, co_id, raw = fut.result()
                    if not raw:
                        fail += 1
                        continue
                    folder = company_folder(co_id, code_by_id)
                    try:
                        rel_main, _ = save_employee_photo_processed_sync(
                            raw,
                            storage_path=storage,
                            employee_id=emp_id,
                            company_folder=folder,
                        )
                        emp = db.query(Employee).filter(Employee.id == emp_id).first()
                        if emp:
                            emp.photo_path = rel_main
                            ok += 1
                        else:
                            fail += 1
                    except ValueError:
                        fail += 1

            db.commit()
            print(f"  progress: ok={ok} fail={fail} / {total}")

        print(f"Done. updated={ok}, failed={fail}, total_missing_was={total}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
