#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
지원번호(applicant_id)로 DB에 저장된 파싱 데이터와 PDF 재파싱 결과를 비교.
사용: python scripts/compare_parsed_with_pdf.py <applicant_id> [pdf_path]
예: python scripts/compare_parsed_with_pdf.py RM-20260219-0008 "z:\path\to\file.pdf"
PDF 경로 생략 시 DB 저장값만 출력.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.models.recruitment import ParsedApplication
from app.services.recruitment.resume_parser import ResumeParser


# 비교할 필드 (DB 컬럼 / 파서 반환 키)
FIELDS = [
    ("applicant_id", "applicant_id"),
    ("applicant_name", "applicant_name"),
    ("applicant_surname", "applicant_surname"),
    ("applicant_email", "applicant_email"),
    ("applicant_phone", "applicant_phone"),
    ("application_date", "application_date"),
    ("applied_position", "applied_position"),
    ("update_date", "update_date"),
    ("date_of_birth", "date_of_birth"),
    ("age", "age"),
    ("address", "address"),
    ("height", "height"),
    ("weight", "weight"),
    ("height_weight", "height_weight"),
    ("education_level", "education_level"),
    ("faculty", "faculty"),
    ("major", "major"),
    ("qualification", "qualification"),
    ("gpa", "gpa"),
    ("last_working_1", "last_working_1"),
    ("lw1_period", "lw1_period"),
    ("desired_salary", "desired_salary"),
    ("desired_positions", "desired_positions"),
    ("desired_work_locations", "desired_work_locations"),
    ("employment_type_preference", "employment_type_preference"),
    ("start_date_available", "start_date_available"),
    ("language_skills", "language_skills"),
    ("line_id", "line_id"),
    ("nationality", "nationality"),
    ("gender", "gender"),
    ("religion", "religion"),
    ("marital_status", "marital_status"),
    ("certification_license", "certification_license"),
    ("training_info", "training_info"),
]


def get_parsed_record(db, applicant_id: str):
    return db.query(ParsedApplication).filter(ParsedApplication.applicant_id == applicant_id).first()


def row_to_dict(pa: ParsedApplication):
    d = {}
    for col in ["applicant_id", "applicant_name", "applicant_surname", "applicant_email", "applicant_phone",
                "application_date", "applied_position", "update_date", "date_of_birth", "age", "address",
                "height", "weight", "height_weight", "education_level", "faculty", "major", "qualification", "gpa",
                "last_working_1", "lw1_period", "desired_salary", "desired_positions", "desired_work_locations",
                "employment_type_preference", "start_date_available", "language_skills", "line_id",
                "nationality", "gender", "religion", "marital_status", "certification_license", "training_info"]:
        d[col] = getattr(pa, col, None)
    return d


def main():
    if len(sys.argv) < 2:
        print("사용법: python scripts/compare_parsed_with_pdf.py <applicant_id> [pdf_path]")
        print("예: python scripts/compare_parsed_with_pdf.py RM-20260219-0008")
        sys.exit(1)
    applicant_id = sys.argv[1].strip()
    pdf_path = Path(sys.argv[2].strip()) if len(sys.argv) >= 3 else None

    db = SessionLocal()
    try:
        pa = get_parsed_record(db, applicant_id)
        if not pa:
            print(f"DB에 지원번호 '{applicant_id}' 레코드가 없습니다.")
            sys.exit(2)
        stored = row_to_dict(pa)
        parsed_data = (pa.parsed_data or {}) if isinstance(pa.parsed_data, dict) else {}
        raw_text_from_db = (pa.raw_text or "") if getattr(pa, "raw_text", None) else ""
    finally:
        db.close()

    if pdf_path is None or not pdf_path.exists():
        if pdf_path is not None:
            print(f"PDF 파일이 없거나 접근 불가: {pdf_path}")
        print("\n--- DB 저장값 요약 (누락/빈 값 체크) ---")
        for k, v in stored.items():
            empty = v is None or (isinstance(v, str) and v.strip() == "")
            if empty:
                print(f"  [비어있음] {k}")
            else:
                preview = (v[:60] + "…") if isinstance(v, str) and len(v) > 60 else v
                print(f"  [있음] {k}: {preview}")
        print("\n--- parsed_data 요약 ---")
        for key in ["education_entries", "experience_entries", "training_cert_entries", "typing_speed", "special_skills", "achievements", "references"]:
            val = parsed_data.get(key)
            if val is None:
                print(f"  {key}: 없음")
            elif isinstance(val, list):
                print(f"  {key}: {len(val)}건")
            else:
                print(f"  {key}: {(str(val)[:50] + '…') if len(str(val)) > 50 else val}")
        # raw_text 상태 및 지원직위/수정일 라벨 스니펫 (파싱 디버깅용)
        print("\n--- raw_text 상태 ---")
        if not raw_text_from_db or len(raw_text_from_db.strip()) < 10:
            print("  raw_text: 없음 또는 비어있음 (동일 PDF 재업로드 시 저장됨)")
        else:
            print(f"  raw_text: 있음 ({len(raw_text_from_db)}자)")
            found_any = False
            for label, name in [("สมัครตำแหน่ง", "지원 직위"), ("แก้ไขประวัติล่าสุด", "최종 이력서 수정일")]:
                i = raw_text_from_db.find(label)
                if i >= 0:
                    found_any = True
                    start = max(0, i - 20)
                    end = min(len(raw_text_from_db), i + 180)
                    snippet = raw_text_from_db[start:end]
                    print(f"\n  [{name}] 라벨 주변:")
                    print(f"    {repr(snippet)}")
            if not found_any:
                print("  'สมัครตำแหน่ง', 'แก้ไขประวัติล่าสุด' 라벨 없음. raw_text 앞 600자:")
                print(f"    {repr(raw_text_from_db[:600])}")
        if pdf_path is None:
            print("\nPDF 경로를 지정하면 재파싱 결과와 비교할 수 있습니다.")
        sys.exit(0 if pdf_path is None else 3)

    parser = ResumeParser()
    try:
        fresh = parser.parse_pdf_to_structured_data(
            str(pdf_path),
            form_type_hint=2,
            language_hint="th",
            original_filename=pdf_path.name,
        )
    except Exception as e:
        print(f"PDF 파싱 오류: {e}")
        sys.exit(4)

    # parsed_data 내 리스트 항목
    fresh_edu = (fresh.get("parsed_data") or {}).get("education_entries") or []
    fresh_exp = (fresh.get("parsed_data") or {}).get("experience_entries") or []
    stored_edu = parsed_data.get("education_entries") or []
    stored_exp = parsed_data.get("experience_entries") or []

    print("=" * 70)
    print(f"비교: 지원번호 {applicant_id} | PDF: {pdf_path.name}")
    print("=" * 70)

    # 1) 필드별 비교: DB 저장값 vs 재파싱값
    print("\n[1] 필드별 비교 (DB vs 재파싱)")
    print("-" * 70)
    missing_in_db = []
    empty_in_db_but_filled_in_parse = []
    different = []
    for db_key, parse_key in FIELDS:
        s_val = stored.get(db_key)
        p_val = fresh.get(parse_key)
        s_empty = s_val is None or (isinstance(s_val, str) and s_val.strip() == "")
        p_empty = p_val is None or (isinstance(p_val, str) and p_val.strip() == "")
        if s_empty and not p_empty:
            empty_in_db_but_filled_in_parse.append((db_key, p_val))
        elif not s_empty and p_empty:
            missing_in_db.append((db_key, s_val))
        elif not s_empty and not p_empty and str(s_val).strip() != str(p_val).strip():
            different.append((db_key, s_val, p_val))

    if empty_in_db_but_filled_in_parse:
        print("\n▶ DB에는 비어있고, 재파싱에서는 값이 있는 항목 (파싱 로직 보완 시 채워질 수 있음):")
        for k, v in empty_in_db_but_filled_in_parse:
            preview = (str(v)[:70] + "…") if len(str(v)) > 70 else v
            print(f"   {k}: {preview}")
    if missing_in_db:
        print("\n▶ DB에는 있는데 재파싱에서는 없는 항목:")
        for k, v in missing_in_db:
            print(f"   {k}: {(str(v)[:70] + '…') if len(str(v)) > 70 else v}")
    if different:
        print("\n▶ 값이 다른 항목:")
        for k, sv, pv in different:
            print(f"   {k}")
            print(f"      DB:   {(str(sv)[:60] + '…') if len(str(sv)) > 60 else sv}")
            print(f"      Parse: {(str(pv)[:60] + '…') if len(str(pv)) > 60 else pv}")

    # 2) parsed_data 내 리스트
    print("\n[2] education_entries / experience_entries")
    print("-" * 70)
    print(f"   DB   education_entries: {len(stored_edu)}건")
    print(f"   Parse education_entries: {len(fresh_edu)}건")
    print(f"   DB   experience_entries: {len(stored_exp)}건")
    print(f"   Parse experience_entries: {len(fresh_exp)}건")
    if fresh_edu and not stored_edu:
        print("   → education_entries가 DB에 없음. 재파싱 후 저장하면 채워짐.")
    if fresh_exp and not stored_exp:
        print("   → experience_entries가 DB에 없음. 재파싱 후 저장하면 채워짐.")

    # 3) 기타 parsed_data 키
    other_keys = ["training_cert_entries", "typing_speed", "special_skills", "achievements", "references"]
    print("\n[3] parsed_data 기타 항목")
    print("-" * 70)
    for key in other_keys:
        st = parsed_data.get(key)
        ft = (fresh.get("parsed_data") or {}).get(key)
        st_ok = st and (len(st) > 0 if isinstance(st, (list, str)) else True)
        ft_ok = ft and (len(ft) > 0 if isinstance(ft, (list, str)) else True)
        print(f"   {key}: DB={'있음' if st_ok else '없음/비어있음'}, Parse={'있음' if ft_ok else '없음/비어있음'}")

    print("\n" + "=" * 70)
    print("비교 완료. 위 'DB 비어있고 재파싱에 값 있음' 항목은 재업로드 시 채워집니다.")


if __name__ == "__main__":
    main()
