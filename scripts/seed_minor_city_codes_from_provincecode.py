"""
provincecode.csv 기반 minor_codes 시딩(도시정보)

요구사항 반영:
- 회사코드: AAA
- Major 코드: '도시정보'(DB의 major_codes에서 name_kor/major_code 기준으로 매칭)
- minor_code: 0001부터 순차 생성
- code_definition_type: System Defined
- name_kor/name_eng/name_thai: CSV(태국어) 기반 자동 번역(한국어/영문)

주의:
- 중복 삽입 방지 위해 기존 minor_code가 있으면 스킵/업데이트합니다.
- 번역은 OpenAI API를 사용합니다(OPENAI_API_KEY 필요).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# 실행 파일이 `scripts/`에 있으므로 sys.path에 프로젝트 루트를 추가해서 `app` import 오류를 방지합니다.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.company import Company
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode


CSV_THAI_COL = "ProveNameT"
CSV_ENG_COL = "ProveNameE"  # 실제론 태국어로 들어있을 수 있으나, fallback/참조용으로만 유지


@dataclass(frozen=True)
class CityRow:
    thai: str
    prov_id: Optional[str] = None


def _read_cities_from_csv(csv_path: str) -> List[CityRow]:
    cities: List[CityRow] = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            thai = (row.get(CSV_THAI_COL) or "").strip()
            prov_id = (row.get("ProvID") or "").strip() or None

            # '-' / NULL / 빈 값은 스킵
            if not thai or thai in {"-", "NULL", "null"}:
                continue

            cities.append(CityRow(thai=thai, prov_id=prov_id))
    return cities


def _find_company(db: Session, company_code: str) -> Company:
    row = db.query(Company).filter(Company.company_code == company_code).first()
    if not row:
        raise SystemExit(f"[ERROR] company_code='{company_code}' 회사가 DB에 없습니다.")
    return row


def _find_major_for_cities(
    db: Session, company_id: int, major_query: str, *, strict_name_kor: bool = True
) -> MajorCode:
    """
    major_query='도시정보' 가 들어있는 major_codes를 찾습니다.
    - 기본: name_kor == major_query OR major_code == major_query
    - strict_name_kor=True 이면 name_kor을 우선합니다.
    """

    q = db.query(MajorCode).filter(MajorCode.company_id == company_id)

    exact_matches: List[MajorCode] = []
    if strict_name_kor:
        exact_matches = (
            q.filter(
                (MajorCode.name_kor == major_query)
                | (MajorCode.major_code == major_query)
            )
            .all()
        )
    else:
        exact_matches = (
            q.filter(
                (MajorCode.name_kor == major_query)
                | (MajorCode.major_code == major_query)
                | (MajorCode.name_eng == major_query)
                | (MajorCode.name_thai == major_query)
            )
            .all()
        )

    if len(exact_matches) == 1:
        return exact_matches[0]

    # fallback: 부분검색(이름이 '도시정보(기타)' 같은 케이스 대비)
    if len(exact_matches) != 1:
        partial = q.filter(
            (MajorCode.name_kor.ilike(f"%{major_query}%"))
            | (MajorCode.major_code.ilike(f"%{major_query}%"))
        ).all()
        if len(partial) == 1:
            return partial[0]

    # 애매하면 중단
    all_rows = q.all()
    candidates = [
        r
        for r in all_rows
        if (r.name_kor and major_query in r.name_kor)
        or (r.major_code and major_query in r.major_code)
    ]
    cand_preview = ", ".join(
        [f"id={c.id} major_code={c.major_code} name_kor={c.name_kor}" for c in candidates[:5]]
    )
    raise SystemExit(
        "[ERROR] 도시정보 major_code를 정확히 찾지 못했습니다. "
        f"company_id={company_id}, major_query='{major_query}'. "
        f"후보(일부): {cand_preview or '(none)'}"
    )


def _load_translation_cache(cache_path: str) -> Dict[str, Dict[str, str]]:
    if not os.path.exists(cache_path):
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_translation_cache(cache_path: str, data: Dict[str, Dict[str, str]]) -> None:
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _extract_first_json_object(text: str) -> str:
    """
    모델 응답에서 JSON 부분만 추출.
    (json.loads 실패하면 여기서 재시도)
    """
    m = re.search(r"(\{.*\}|\[.*\])", text, flags=re.DOTALL)
    if not m:
        raise ValueError("No JSON found in model response.")
    return m.group(1)


def _translate_thai_provinces(
    thai_names: List[str],
    *,
    model: str,
    cache: Dict[str, Dict[str, str]],
    client: OpenAI,
) -> Dict[str, Dict[str, str]]:
    """
    cache를 갱신하면서, 필요한 항목만 OpenAI로 번역합니다.
    반환: cache와 동일 포맷(키: thai name, 값: {en, ko})
    """

    missing = [n for n in thai_names if n not in cache]
    if not missing:
        return cache

    # 너무 큰 요청 방지(Chunking은 상위에서 처리하지만 안전장치)
    # 여기서는 한번에 missing 전체를 넣되 prompt가 커지는 걸 피하기 위해 호출 단에서 chunking 권장.
    prompt_list = "\n".join([f"- {n}" for n in missing])

    system = (
        "You are a translation engine for Thai province names. "
        "Translate each Thai province name into (1) English common name and (2) Korean Hangul transliteration. "
        "Return ONLY valid JSON."
    )
    user = (
        "Translate the following Thai province names.\n"
        "Rules:\n"
        "- Output JSON object whose keys are exactly the original Thai strings.\n"
        "- Each value is an object with keys: \"en\" and \"ko\".\n"
        "- English should be proper province name (e.g., Bangkok).\n"
        "- Korean should be Hangul transliteration (e.g., 방콕).\n"
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


def _chunked(xs: List[str], size: int) -> List[List[str]]:
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

    # DB connect
    db = SessionLocal()
    try:
        company = _find_company(db, company_code)
        major = _find_major_for_cities(db, company.id, major_query)
        print(
            f"[INFO] company_id={company.id} company_code={company.company_code}, "
            f"major_code_id={major.id} major_code={major.major_code} name_kor={major.name_kor}"
        )

        cities = _read_cities_from_csv(csv_path)
        if not cities:
            raise SystemExit(f"[ERROR] CSV에서 유효한 데이터가 없습니다: {csv_path}")

        thai_names = [c.thai for c in cities]

        # Translation cache load
        cache = _load_translation_cache(translation_cache_path)
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # Missing translations in chunks
        unique_thai = list(dict.fromkeys(thai_names))
        missing_thai = [n for n in unique_thai if n not in cache]
        print(f"[INFO] translation needed: {len(missing_thai)} / {len(unique_thai)}")

        for chunk in _chunked(missing_thai, translate_chunk_size):
            if dry_run:
                # Dry-run이면 번역 호출을 생략하고 기본값만 채웁니다.
                for t in chunk:
                    cache.setdefault(t, {"en": "", "ko": ""})
                continue

            cache = _translate_thai_provinces(
                chunk,
                model=translate_model,
                cache=cache,
                client=client,
            )
            _save_translation_cache(translation_cache_path, cache)

        # Build desired rows
        desired: List[Tuple[str, str, str]] = []  # (minor_code, name_kor, name_eng, name_thai) but keep simple below
        # We'll store as dicts to keep readability
        desired_rows: List[Dict[str, Optional[str]]] = []
        for i, c in enumerate(cities):
            minor_code = str(start_minor_code + i).zfill(4)
            t = cache.get(c.thai) or {"en": "", "ko": ""}
            desired_rows.append(
                {
                    "minor_code": minor_code,
                    "name_kor": (t.get("ko") or "").strip() or None,
                    "name_eng": (t.get("en") or "").strip() or None,
                    "name_thai": c.thai,
                }
            )

        # Existing minors
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
                # 이미 존재하면 스킵(기본). 단, System Defined 이고 update_existing=True면 이름 갱신.
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
            f"[INFO] city rows={len(cities)}, will insert={inserted}, "
            f"will update={updated}, skipped={skipped}, dry_run={dry_run}"
        )

        if dry_run:
            print("[DRY_RUN] 번역 호출/DB 변경을 실제로 수행하지 않습니다.")
            return

        # Apply updates/creates
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
    parser = argparse.ArgumentParser(description="Seed minor_codes from provincecode.csv")
    parser.add_argument("--csv-path", default="주소기준정보/provincecode.csv")
    parser.add_argument("--company-code", default="AAA")
    parser.add_argument("--major-query", default="도시정보")
    parser.add_argument("--start-minor-code", type=int, default=1)
    parser.add_argument("--code-definition-type", default="System Defined")
    parser.add_argument("--dry-run", action="store_true", help="DB 변경 및 번역 호출을 하지 않음")
    parser.add_argument("--update-existing", action="store_true", help="기존 System Defined 이름만 갱신")
    parser.add_argument("--translate-chunk-size", type=int, default=15)
    parser.add_argument("--translation-cache-path", default="scripts/.cache/provincecode_translation.json")
    parser.add_argument(
        "--translate-model",
        default=settings.OPENAI_MODEL,
        help="OpenAI 모델 (기본: settings.OPENAI_MODEL)",
    )
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

