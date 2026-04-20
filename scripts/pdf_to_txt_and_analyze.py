#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
JobThai 등 PDF 이력서를 파싱하여 TXT로 저장하고, 추출 텍스트와 파싱 결과를 비교·분석.

사용: python scripts/pdf_to_txt_and_analyze.py <pdf_path>

예:
  python scripts/pdf_to_txt_and_analyze.py "JobThai - 3150864_จันธเสม_ศิริรัตน์ - Application CMM.pdf"
  (PDF를 프로젝트 루트에 둔 경우)

출력:
  - <원본이름>.txt : PDF에서 추출한 원문 텍스트 (같은 폴더에 저장)
  - <원본이름>_header_oneline.txt : 헤더 구간을 한 줄로 정규화한 문자열 (파서가 매칭하는 입력)
  - 콘솔: 파싱 결과(지원직위/수정일), 라벨 존재 여부, 헤더 2500자
"""
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.recruitment.resume_parser import ResumeParser


def main():
    if len(sys.argv) < 2:
        print("사용법: python scripts/pdf_to_txt_and_analyze.py <pdf_path>")
        print("예: python scripts/pdf_to_txt_and_analyze.py \"JobThai - 3150864_จันธเสม_ศิริรัตน์ - Application CMM.pdf\"")
        sys.exit(1)
    pdf_path = Path(sys.argv[1].strip())
    if not pdf_path.exists():
        print(f"파일이 없습니다: {pdf_path}")
        sys.exit(2)
    if pdf_path.suffix.lower() != ".pdf":
        print("PDF 파일 경로를 지정해 주세요.")
        sys.exit(3)

    parser = ResumeParser()
    try:
        raw_text = parser.extract_text(str(pdf_path))
    except Exception as e:
        print(f"PDF 텍스트 추출 오류: {e}")
        sys.exit(4)

    out_txt = pdf_path.with_suffix(".txt")
    out_txt.write_text(raw_text, encoding="utf-8")
    print(f"추출 텍스트 저장: {out_txt}")
    print(f"총 글자 수: {len(raw_text)}")

    # 파서가 보는 헤더 구간(앞 4000자, NFC 정규화, 공백/줄바꿈 → 한 칸) 저장 → 비교용
    import re
    zone = raw_text[:4000]
    zone_nfc = unicodedata.normalize("NFC", zone)
    header_one_line = re.sub(r"\s+", " ", zone_nfc).strip()
    out_header = pdf_path.parent / (pdf_path.stem + "_header_oneline.txt")
    out_header.write_text(header_one_line, encoding="utf-8")
    print(f"헤더 한 줄 정규화 저장: {out_header} (파서가 매칭하는 문자열)")

    # 구조화 파싱 (지원직위, 수정일 확인)
    try:
        parsed = parser.parse_pdf_to_structured_data(
            str(pdf_path),
            form_type_hint=2,
            language_hint="th",
            original_filename=pdf_path.name,
        )
        applied = parsed.get("applied_position") or ""
        update = parsed.get("update_date") or ""
        print("\n--- 파싱 결과 (지원직위 / 최종 이력서 수정일) ---")
        print(f"  applied_position: {applied if applied else '(비어있음)'}")
        print(f"  update_date:      {update if update else '(비어있음)'}")
    except Exception as e:
        print(f"\n구조화 파싱 오류: {e}")
        applied = ""
        update = ""

    # 추출 TXT 분석: 지원직위/수정일 라벨 존재 여부 및 주변 텍스트
    print("\n--- 추출 TXT 분석 (PDF→TXT에 해당 문구가 어떻게 나오는지) ---")
    raw_nfc = unicodedata.normalize("NFC", raw_text)
    raw_one_line = " ".join(raw_nfc.split())

    labels = [
        ("สมัครตำแหน่ง", "지원 직위"),
        ("แก้ไขประวัติล่าสุด", "최종 이력서 수정일"),
    ]
    for label, name in labels:
        idx = raw_text.find(label)
        idx_nfc = raw_nfc.find(label)
        idx_one = raw_one_line.find(label)
        print(f"\n  [{name}] 라벨 '{label}'")
        print(f"    원본(raw_text) 위치: {idx if idx >= 0 else '없음'}")
        print(f"    NFC 정규화 후 위치: {idx_nfc if idx_nfc >= 0 else '없음'}")
        print(f"    한 줄 정규화 후 위치: {idx_one if idx_one >= 0 else '없음'}")
        if idx >= 0:
            snippet = raw_text[idx : idx + 120]
            print(f"    원본 주변(120자): {repr(snippet)}")
        elif idx_nfc >= 0:
            snippet = raw_nfc[idx_nfc : idx_nfc + 120]
            print(f"    NFC 주변(120자): {repr(snippet)}")
        else:
            for variant in ["สมัครต", "แหน่ง", "แก้ไข", "ล่าสุด"]:
                i = raw_text.find(variant)
                if i >= 0:
                    print(f"    부분 문자열 '{variant}' 위치 {i}, 주변: {repr(raw_text[i:i+80])}")
                    break

    # 추출 텍스트 앞 2500자 (헤더 구간) 출력 → 파서가 보는 문자열 확인
    print("\n--- 추출 TXT 앞 2500자 (헤더 구간, 파서 입력과 동일) ---")
    header = raw_text[:2500]
    print(header)
    print("\n--- (끝) ---")
    print("\n분석 완료. 위 '한 줄 정규화 후 위치'가 '없음'이면 PDF 추출 시 해당 라벨이 다른 문자로 나오는 것입니다.")
    print("저장된 TXT 파일을 열어 지원직위/수정일 문구가 어떻게 추출되었는지 확인한 뒤, 파서 로직을 수정할 수 있습니다.")


if __name__ == "__main__":
    main()
