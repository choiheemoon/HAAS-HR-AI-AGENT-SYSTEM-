#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
이력서 양식 폴더의 PDF를 양식별로 파싱 검증.
사용: python scripts/validate_resume_parsing.py [이력서_양식_폴더_경로]
폴더 미지정 시 프로젝트 루트의 "이력서 양식" 또는 현재 디렉터리 사용.
"""
import os
import sys
from pathlib import Path

# 프로젝트 루트를 path에 추가
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.recruitment.resume_parser import ResumeParser

FORM_LABELS = {1: "Jobbkk", 2: "JobThai", 3: "LinkedIn", 4: "Linked Simple", 5: "양식5"}


def main():
    if len(sys.argv) >= 2:
        folder = Path(sys.argv[1])
    else:
        folder = ROOT / "이력서 양식"
        if not folder.exists():
            folder = Path.cwd()
    if not folder.is_dir():
        print(f"오류: 폴더가 없습니다: {folder}")
        sys.exit(1)

    pdfs = sorted(folder.glob("*.pdf"))
    if not pdfs:
        print(f"해당 폴더에 PDF가 없습니다: {folder}")
        sys.exit(0)

    parser = ResumeParser()
    print(f"폴더: {folder}")
    print(f"PDF {len(pdfs)}개 검증\n")
    print("-" * 80)

    for i, pdf_path in enumerate(pdfs, 1):
        name = pdf_path.name
        try:
            result = parser.parse_pdf_to_structured_data(
                str(pdf_path),
                form_type_hint=None,
                language_hint=None,
                original_filename=name,
            )
            form_type = result.get("form_type", 1)
            form_label = FORM_LABELS.get(form_type, f"양식{form_type}")
            print(f"[{i}] {name}")
            print(f"    양식: {form_label} (form_type={form_type})")
            print(f"    이름: {result.get('applicant_name') or '-'}")
            print(f"    성: {result.get('applicant_surname') or '-'}")
            print(f"    이메일: {result.get('applicant_email') or '-'}")
            print(f"    연락처: {result.get('applicant_phone') or '-'}")
            print(f"    언어: {result.get('document_language') or '-'}")
            print(f"    지원직위: {(result.get('applied_position') or '-')[:60]}")
            print()
        except Exception as e:
            print(f"[{i}] {name}")
            print(f"    오류: {e}")
            print()

    print("-" * 80)
    print("검증 완료.")


if __name__ == "__main__":
    main()
