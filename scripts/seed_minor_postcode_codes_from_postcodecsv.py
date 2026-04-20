"""
postcode.csv 기반 minor_codes 시딩(우편번호)

요구사항:
- 회사코드: AAA
- Major 코드: '우편번호' (DB major_codes에서 name_kor/major_code 기준 매칭)
- minor_code: 0001부터 순차 생성
- code_definition_type: System Defined
- minor의 값/표시: ZipcodeCode를 name_kor/name_eng/name_thai에 그대로 세팅
- postcode.csv에는 동일 ZipcodeCode가 여러 행으로 존재할 수 있으므로,
  ZipcodeCode 기준 "중복 제거(첫 등장 순서 유지)" 후 시딩합니다.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from collections import OrderedDict
from typing import Dict, List, Optional


# 실행 파일이 `scripts/`에 있으므로 sys.path에 프로젝트 루트를 추가해서 `app` import 오류를 방지합니다.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from app.config import settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode


CSV_ZIP_COL = "ZipcodeCode"


def _read_unique_postcodes(csv_path: str) -> List[str]:
    """
    postcode.csv의 ZipcodeCode 중복을 제거합니다.
    - '-' / NULL / 빈 값 제외
    - 첫 등장 순서 유지
    """
    ordered: "OrderedDict[str, None]" = OrderedDict()
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get(CSV_ZIP_COL) or "").strip()
            if not raw or raw in {"-", "NULL", "null"}:
                continue
            # 안전장치: 숫자/영문/공백 등 잡음 제거 시도(원본이 숫자 형태인 케이스가 대부분)
            raw = raw.strip()
            if raw not in ordered:
                ordered[raw] = None
    return list(ordered.keys())


def _find_company(db, company_code: str) -> Company:
    row = db.query(Company).filter(Company.company_code == company_code).first()
    if not row:
        raise SystemExit(f"[ERROR] company_code='{company_code}' 회사가 DB에 없습니다.")
    return row


def _find_major(db, company_id: int, major_query: str) -> MajorCode:
    q = db.query(MajorCode).filter(MajorCode.company_id == company_id)
    exact = q.filter((MajorCode.name_kor == major_query) | (MajorCode.major_code == major_query)).all()
    if len(exact) == 1:
        return exact[0]

    partial = q.filter(
        (MajorCode.name_kor.ilike(f"%{major_query}%")) | (MajorCode.major_code.ilike(f"%{major_query}%"))
    ).all()
    if len(partial) == 1:
        return partial[0]

    raise SystemExit(f"[ERROR] major을 찾지 못했습니다. company_id={company_id}, major_query='{major_query}'")


def run(
    *,
    csv_path: str,
    company_code: str,
    major_query: str,
    start_minor_code: int,
    code_definition_type: str,
    dry_run: bool,
    update_existing: bool,
) -> None:
    if code_definition_type not in {"User Defined", "System Defined"}:
        raise SystemExit(f"[ERROR] Invalid code_definition_type: {code_definition_type}")

    db = SessionLocal()
    try:
        company = _find_company(db, company_code)
        major = _find_major(db, company.id, major_query)
        print(
            f"[INFO] company_id={company.id} company_code={company.company_code}, "
            f"major_code_id={major.id} major_code={major.major_code} name_kor={major.name_kor}"
        )

        postcodes = _read_unique_postcodes(csv_path)
        if not postcodes:
            raise SystemExit(f"[ERROR] CSV에서 유효한 ZipcodeCode가 없습니다: {csv_path}")

        desired_rows: List[Dict[str, Optional[str]]] = []
        for i, zip_code in enumerate(postcodes):
            minor_code = str(start_minor_code + i).zfill(4)
            desired_rows.append(
                {
                    "minor_code": minor_code,
                    "name_kor": zip_code,
                    "name_eng": zip_code,
                    "name_thai": zip_code,
                }
            )

        existing_rows: List[MinorCode] = (
            db.query(MinorCode)
            .filter(MinorCode.company_id == company.id)
            .filter(MinorCode.major_code_id == major.id)
            .all()
        )
        existing_by_minor = {r.minor_code: r for r in existing_rows}

        to_create: List[MinorCode] = []
        to_update: List[tuple[MinorCode, Dict[str, Optional[str]]]] = []
        inserted = 0
        updated = 0
        skipped = 0

        for row in desired_rows:
            mc = row["minor_code"]
            ex = existing_by_minor.get(mc)
            if not ex:
                inserted += 1
                if not dry_run:
                    to_create.append(
                        MinorCode(
                            company_id=company.id,
                            major_code_id=major.id,
                            minor_code=mc,
                            code_definition_type=code_definition_type,
                            name_kor=row["name_kor"],
                            name_eng=row["name_eng"],
                            name_thai=row["name_thai"],
                        )
                    )
            else:
                if update_existing and ex.code_definition_type == "System Defined":
                    if (
                        (ex.name_kor or None) != row["name_kor"]
                        or (ex.name_eng or None) != row["name_eng"]
                        or (ex.name_thai or None) != row["name_thai"]
                    ):
                        updated += 1
                        if not dry_run:
                            to_update.append((ex, row))
                    else:
                        skipped += 1
                else:
                    skipped += 1

        print(
            f"[INFO] unique postcodes={len(postcodes)}, will insert={inserted}, "
            f"will update={updated}, skipped={skipped}, dry_run={dry_run}"
        )

        if dry_run:
            print("[DRY_RUN] 번역/DB 변경을 실제로 수행하지 않습니다.")
            return

        for ex, row in to_update:
            ex.name_kor = row["name_kor"]
            ex.name_eng = row["name_eng"]
            ex.name_thai = row["name_thai"]

        for m in to_create:
            db.add(m)

        db.commit()
        print(f"[OK] committed. inserted={len(to_create)}, updated={len(to_update)}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed minor_codes from postcode.csv")
    parser.add_argument("--csv-path", default="주소기준정보/postcode.csv")
    parser.add_argument("--company-code", default="AAA")
    parser.add_argument("--major-query", default="우편번호")
    parser.add_argument("--start-minor-code", type=int, default=1)
    parser.add_argument("--code-definition-type", default="System Defined")
    parser.add_argument("--dry-run", action="store_true", help="DB 변경을 실제로 수행하지 않습니다.")
    parser.add_argument("--update-existing", action="store_true", help="기존 System Defined 값만 이름 갱신합니다.")
    args = parser.parse_args()

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = args.csv_path
    if not os.path.isabs(csv_path):
        csv_path = os.path.join(repo_root, csv_path)

    run(
        csv_path=csv_path,
        company_code=args.company_code,
        major_query=args.major_query,
        start_minor_code=args.start_minor_code,
        code_definition_type=args.code_definition_type,
        dry_run=args.dry_run,
        update_existing=args.update_existing,
    )


if __name__ == "__main__":
    main()

