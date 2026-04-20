"""
districtcode.csv 기반 minor_codes 시딩(시/군/구)

요구사항 반영:
- 회사코드: AAA
- Major 코드: '시/군/구'(DB의 major_codes에서 name_kor/major_code 기준으로 매칭)
- minor_code: 0001부터 순차 생성 (CSV 유효 row만 대상으로)
- code_definition_type: System Defined
- name_thai: districtcode.csv의 DistrictT
- name_kor/name_eng: DistrictT를 OpenAI로 번역(한국어/영문)

운영 팁:
- 기본은 기존 데이터가 있으면 해당 minor_code는 스킵합니다.
- 재시딩이 필요하면 --start-minor-code와 options를 동일하게 맞추세요.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from typing import Dict, List, Optional, Tuple

from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy.orm import Session


# 실행 파일이 `scripts/`에 있으므로 sys.path에 프로젝트 루트를 추가해서 `app` import 오류를 방지합니다.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from app.config import settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode


CSV_THAI_COL = "DistrictT"
CSV_ENG_COL = "DistrictE"  # 참고용(현재는 번역 소스로 사용하지 않습니다)


@dataclass(frozen=True)
class DistrictRow:
    thai: str


def _read_districts_from_csv(csv_path: str) -> List[DistrictRow]:
    districts: List[DistrictRow] = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            thai = (row.get(CSV_THAI_COL) or "").strip()
            if not thai or thai in {"-", "NULL", "null"}:
                continue
            districts.append(DistrictRow(thai=thai))
    return districts


def _find_company(db: Session, company_code: str) -> Company:
    row = db.query(Company).filter(Company.company_code == company_code).first()
    if not row:
        raise SystemExit(f"[ERROR] company_code='{company_code}' 회사가 DB에 없습니다.")
    return row


def _find_major(
    db: Session, company_id: int, major_query: str, *, strict_name_kor: bool = True
) -> MajorCode:
    q = db.query(MajorCode).filter(MajorCode.company_id == company_id)

    exact: List[MajorCode]
    if strict_name_kor:
        exact = q.filter(
            (MajorCode.name_kor == major_query) | (MajorCode.major_code == major_query)
        ).all()
    else:
        exact = q.filter(
            (MajorCode.name_kor == major_query)
            | (MajorCode.major_code == major_query)
            | (MajorCode.name_eng == major_query)
            | (MajorCode.name_thai == major_query)
        ).all()

    if len(exact) == 1:
        return exact[0]

    if len(exact) != 1:
        partial = q.filter(
            (MajorCode.name_kor.ilike(f"%{major_query}%"))
            | (MajorCode.major_code.ilike(f"%{major_query}%"))
        ).all()
        if len(partial) == 1:
            return partial[0]

    candidates = q.all()
    cand_preview = ", ".join(
        [f"id={c.id} major_code={c.major_code} name_kor={c.name_kor}" for c in candidates[:5]]
    )
    raise SystemExit(
        "[ERROR] major(시/군/구)를 정확히 찾지 못했습니다. "
        f"company_id={company_id}, major_query='{major_query}'. "
        f"후보(일부): {cand_preview or '(none)'}"
    )


def _load_cache(cache_path: str) -> Dict[str, Dict[str, str]]:
    if not os.path.exists(cache_path):
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_cache(cache_path: str, data: Dict[str, Dict[str, str]]) -> None:
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _extract_first_json_object(text: str) -> str:
    m = re.search(r"(\{.*\}|\[.*\])", text, flags=re.DOTALL)
    if not m:
        raise ValueError("No JSON found in model response.")
    return m.group(1)


def _translate_thai_names(
    thai_names: List[str],
    *,
    model: str,
    cache: Dict[str, Dict[str, str]],
    client: OpenAI,
) -> Dict[str, Dict[str, str]]:
    missing = [n for n in thai_names if n not in cache]
    if not missing:
        return cache

    prompt_list = "\n".join([f"- {n}" for n in missing])
    system = (
        "You are a translation engine for Thai district names. "
        "Translate each Thai district name into (1) English common name and (2) Korean Hangul transliteration. "
        "Return ONLY valid JSON."
    )
    user = (
        "Translate the following Thai district names.\n"
        "Rules:\n"
        "- Output JSON object whose keys are exactly the original Thai strings.\n"
        "- Each value is an object with keys: \"en\" and \"ko\".\n"
        "- English should be proper district/common name in English.\n"
        "- Korean should be Hangul transliteration.\n"
        "Thai inputs:\n"
        f"{prompt_list}\n"
    )

    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
    )
    content = resp.choices[0].message.content or ""
    json_text = _extract_first_json_object(content)

    parsed = json.loads(json_text)
    if not isinstance(parsed, dict):
        raise ValueError("Model returned non-dict JSON.")

    for thai, v in parsed.items():
        if not isinstance(v, dict):
            continue
        en = (v.get("en") or "").strip()
        ko = (v.get("ko") or "").strip()
        cache[thai] = {"en": en, "ko": ko}
    return cache


def _chunk(xs: List[str], size: int) -> List[List[str]]:
    return [xs[i : i + size] for i in range(0, len(xs), size)]


def run(
    *,
    csv_path: str,
    company_code: str,
    major_query: str,
    start_minor_code: int,
    code_definition_type: str,
    dry_run: bool,
    update_existing: bool,
    translate_chunk_size: int,
    translate_model: str,
    translation_cache_path: str,
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

        districts = _read_districts_from_csv(csv_path)
        if not districts:
            raise SystemExit(f"[ERROR] CSV에서 유효한 데이터가 없습니다: {csv_path}")

        thai_names = [d.thai for d in districts]
        unique_thai = list(dict.fromkeys(thai_names))

        cache = _load_cache(translation_cache_path)
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        missing = [n for n in unique_thai if n not in cache]
        print(f"[INFO] translation needed: {len(missing)} / {len(unique_thai)}")

        if missing:
            for chunk in _chunk(missing, translate_chunk_size):
                if dry_run:
                    for t in chunk:
                        cache.setdefault(t, {"en": "", "ko": ""})
                    continue
                cache = _translate_thai_names(
                    chunk,
                    model=translate_model,
                    cache=cache,
                    client=client,
                )
                _save_cache(translation_cache_path, cache)

        # Build desired rows
        desired_rows: List[Dict[str, Optional[str]]] = []
        for i, d in enumerate(districts):
            minor_code = str(start_minor_code + i).zfill(4)
            t = cache.get(d.thai) or {"en": "", "ko": ""}
            desired_rows.append(
                {
                    "minor_code": minor_code,
                    "name_kor": (t.get("ko") or "").strip() or None,
                    "name_eng": (t.get("en") or "").strip() or None,
                    "name_thai": d.thai,
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
        to_update: List[Tuple[MinorCode, Dict[str, Optional[str]]]] = []

        inserted = 0
        updated = 0
        skipped = 0

        for row in desired_rows:
            mc = row["minor_code"]
            ex = existing_by_minor.get(mc)
            if not ex:
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
                inserted += 1
            else:
                if (
                    update_existing
                    and ex.code_definition_type == "System Defined"
                    and (
                        (ex.name_kor or None) != row["name_kor"]
                        or (ex.name_eng or None) != row["name_eng"]
                        or (ex.name_thai or None) != row["name_thai"]
                    )
                ):
                    if not dry_run:
                        to_update.append((ex, row))
                    updated += 1
                else:
                    skipped += 1

        print(
            f"[INFO] district rows={len(districts)}, will insert={inserted}, "
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
    parser = argparse.ArgumentParser(description="Seed minor_codes from districtcode.csv")
    parser.add_argument("--csv-path", default="주소기준정보/districtcode.csv")
    parser.add_argument("--company-code", default="AAA")
    parser.add_argument("--major-query", default="시/군/구")
    parser.add_argument("--start-minor-code", type=int, default=1)
    parser.add_argument("--code-definition-type", default="System Defined")
    parser.add_argument("--dry-run", action="store_true", help="DB 변경 및 번역 호출을 하지 않음")
    parser.add_argument("--update-existing", action="store_true", help="기존 System Defined 이름만 갱신")
    parser.add_argument("--translate-chunk-size", type=int, default=20)
    parser.add_argument("--translate-model", default=settings.OPENAI_MODEL)
    parser.add_argument("--translation-cache-path", default="scripts/.cache/districtcode_translation.json")
    args = parser.parse_args()

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = args.csv_path
    if not os.path.isabs(csv_path):
        csv_path = os.path.join(repo_root, csv_path)

    translation_cache_path = args.translation_cache_path
    if not os.path.isabs(translation_cache_path):
        translation_cache_path = os.path.join(repo_root, translation_cache_path)

    run(
        csv_path=csv_path,
        company_code=args.company_code,
        major_query=args.major_query,
        start_minor_code=args.start_minor_code,
        code_definition_type=args.code_definition_type,
        dry_run=args.dry_run,
        update_existing=args.update_existing,
        translate_chunk_size=args.translate_chunk_size,
        translate_model=args.translate_model,
        translation_cache_path=translation_cache_path,
    )


if __name__ == "__main__":
    main()

