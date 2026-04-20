"""기존 parsed_applications 중 지원번호(applicant_id)가 채번 규칙(RM-YYYYMMDD-NNNN)에 맞지 않는
   레코드에 대해 created_at 기준으로 채번을 부여하는 스크립트.
   (id, applicant_id, created_at 만 사용하므로 컬럼 미존재 환경에서도 동작)

사용법:
  python scripts/fix_parsed_application_ref_codes.py          # dry-run (변경 없이 대상만 출력)
  python scripts/fix_parsed_application_ref_codes.py --apply # DB 실제 반영
"""
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

REF_CODE_PATTERN = re.compile(r"^RM-\d{8}-\d{4}$")


def is_valid_ref_code(value) -> bool:
    if not value or not isinstance(value, str):
        return False
    return bool(REF_CODE_PATTERN.match(value.strip()))


def get_max_seq_for_date(conn, date_str: str) -> int:
    prefix = f"RM-{date_str}-"
    r = conn.execute(
        text(
            "SELECT applicant_id FROM parsed_applications WHERE applicant_id LIKE :prefix"
        ),
        {"prefix": f"{prefix}%"},
    )
    max_seq = 0
    for (aid,) in r:
        if not aid or not aid.startswith(prefix):
            continue
        try:
            suffix = aid[len(prefix) :].strip()
            if suffix.isdigit():
                max_seq = max(max_seq, int(suffix))
        except (ValueError, IndexError):
            continue
    return max_seq


def main() -> None:
    dry_run = "--apply" not in sys.argv

    with engine.connect() as conn:
        # id, applicant_id, created_at 만 조회 (다른 컬럼 미존재 시에도 동작)
        r = conn.execute(
            text(
                "SELECT id, applicant_id, created_at FROM parsed_applications ORDER BY created_at ASC"
            )
        )
        rows = [(row[0], row[1], row[2]) for row in r]

        invalid = [
            (id_, applicant_id, created_at)
            for id_, applicant_id, created_at in rows
            if not applicant_id or not is_valid_ref_code(applicant_id)
        ]

        if not invalid:
            print("채번 규칙에 맞지 않는 지원번호를 가진 레코드가 없습니다.")
            return

        date_strs = list({c.strftime("%Y%m%d") for (_, _, c) in invalid if c})
        max_seq_by_date = {d: get_max_seq_for_date(conn, d) for d in date_strs}
        next_seq_by_date = {}

        def next_ref_code(created_at):
            date_str = created_at.strftime("%Y%m%d")
            seq = next_seq_by_date.get(date_str, max_seq_by_date.get(date_str, 0) + 1)
            next_seq_by_date[date_str] = seq + 1
            return f"RM-{date_str}-{seq:04d}"

        print(f"채번 규칙에 맞지 않는 레코드: {len(invalid)}건")
        if dry_run:
            print("(dry-run: --apply 옵션을 주면 실제로 저장합니다)\n")

        for id_, applicant_id, created_at in invalid:
            new_id = next_ref_code(created_at)
            old_display = (applicant_id or "").strip() or "(비어있음)"
            print(f"  id={id_} created_at={created_at} 기존={old_display!r} -> {new_id}")
            if not dry_run:
                conn.execute(
                    text("UPDATE parsed_applications SET applicant_id = :aid WHERE id = :id"),
                    {"aid": new_id, "id": id_},
                )

        if not dry_run and invalid:
            conn.commit()
            print(f"\n{len(invalid)}건 applicant_id 업데이트 완료.")
        elif dry_run:
            print("\n실제 반영하려면: python scripts/fix_parsed_application_ref_codes.py --apply")


if __name__ == "__main__":
    main()
