"""인사 레포트용 집계 (접근 가능 회사 범위 내)."""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode
from app.models.employee_personal_info import EmployeePersonalInfo
from app.models.employee_reference_item import EmployeeReferenceItem

_REF_CATEGORIES = (
    "department",
    "employment_type",
    "work_status",
    "level",
    "position",
)
_UNASSIGNED = "(미지정)"


def _ref_item_label(ri: EmployeeReferenceItem) -> str:
    return (
        (ri.name_kor or ri.name_eng or ri.name_thai or ri.code or "").strip() or _UNASSIGNED
    )


def _dept_lookup_tokens(code: Optional[str]) -> List[str]:
    """기준정보·직원 코드·문자열 매칭용 토큰(대소문자 무시·숫자 코드 앞뒤 0 정규화)."""
    c = (code or "").strip()
    if not c:
        return []
    out: List[str] = []
    cf = c.casefold()
    out.append(cf)
    if c.isdigit():
        n = str(int(c))
        if n != cf:
            out.append(n)
    return list(dict.fromkeys(out))


def _canonical_ref_category(raw: Optional[str]) -> Optional[str]:
    s = (raw or "").strip().casefold()
    if not s:
        return None
    for c in _REF_CATEGORIES:
        if c.casefold() == s:
            return c
    return None


def _register_reference_row(
    r: EmployeeReferenceItem,
    ref_by_id: Dict[int, EmployeeReferenceItem],
    label_maps: Dict[str, Dict[Tuple[int, str], str]],
) -> None:
    ref_by_id[r.id] = r
    cat_key = _canonical_ref_category(r.category)
    if cat_key is None:
        return
    label = _ref_item_label(r)
    lm = label_maps[cat_key]
    for token in _dept_lookup_tokens(r.code):
        lm[(r.company_id, token)] = label
    for nm in (r.name_kor, r.name_eng, r.name_thai):
        n = (nm or "").strip()
        if n:
            lm[(r.company_id, n.casefold())] = label


def _load_reference_bundle(
    db: Session, company_ids: List[int]
) -> Tuple[Dict[int, EmployeeReferenceItem], Dict[str, Dict[Tuple[int, str], str]]]:
    label_maps: Dict[str, Dict[Tuple[int, str], str]] = {c: {} for c in _REF_CATEGORIES}
    if not company_ids:
        return {}, label_maps
    cats_cf = [c.casefold() for c in _REF_CATEGORIES]
    rows = (
        db.query(EmployeeReferenceItem)
        .filter(
            EmployeeReferenceItem.company_id.in_(company_ids),
            func.lower(func.trim(EmployeeReferenceItem.category)).in_(cats_cf),
        )
        .all()
    )
    ref_by_id: Dict[int, EmployeeReferenceItem] = {}
    for r in rows:
        _register_reference_row(r, ref_by_id, label_maps)
    return ref_by_id, label_maps


def _merge_reference_items_by_id(
    db: Session,
    ref_by_id: Dict[int, EmployeeReferenceItem],
    label_maps: Dict[str, Dict[Tuple[int, str], str]],
    item_ids: List[int],
) -> None:
    need = [i for i in item_ids if i and i not in ref_by_id]
    if not need:
        return
    rows = db.query(EmployeeReferenceItem).filter(EmployeeReferenceItem.id.in_(need)).all()
    for r in rows:
        _register_reference_row(r, ref_by_id, label_maps)


def _label_from_code_map(
    company_id: Optional[int],
    code: str,
    label_map: Dict[Tuple[int, str], str],
    scope_company_ids: List[int],
) -> Optional[str]:
    tokens = _dept_lookup_tokens(code)
    if not tokens:
        return None
    if company_id is not None:
        for t in tokens:
            if (company_id, t) in label_map:
                return label_map[(company_id, t)]
        return None
    hits: List[str] = []
    for scid in scope_company_ids:
        for t in tokens:
            key = (scid, t)
            if key in label_map:
                hits.append(label_map[key])
    if not hits:
        return None
    uniq = list(dict.fromkeys(hits))
    return uniq[0]


def _resolve_ref_label(
    e: Employee,
    cat_key: str,
    item_id_field: str,
    code_field: str,
    ref_by_id: Dict[int, EmployeeReferenceItem],
    label_maps: Dict[str, Dict[Tuple[int, str], str]],
    scope_company_ids: List[int],
) -> str:
    item_id = getattr(e, item_id_field, None)
    if item_id:
        ri = ref_by_id.get(int(item_id))
        if ri is not None:
            return _ref_item_label(ri)
    code = (getattr(e, code_field, None) or "").strip()
    if not code:
        return _UNASSIGNED
    lm = label_maps.get(cat_key, {})
    mapped = _label_from_code_map(e.company_id, code, lm, scope_company_ids)
    if mapped is not None:
        return mapped
    return code


def _active_department_label(
    e: Employee,
    ref_by_id: Dict[int, EmployeeReferenceItem],
    label_maps: Dict[str, Dict[Tuple[int, str], str]],
    scope_company_ids: List[int],
) -> str:
    return _resolve_ref_label(
        e, "department", "department_item_id", "department", ref_by_id, label_maps, scope_company_ids
    )


def _month_end(y: int, m: int) -> date:
    return date(y, m, monthrange(y, m)[1])


def _months_back(n: int, end: date) -> List[Tuple[int, int]]:
    y, m = end.year, end.month
    out: List[Tuple[int, int]] = []
    for _ in range(n):
        out.append((y, m))
        m -= 1
        if m < 1:
            m = 12
            y -= 1
    return list(reversed(out))


def _normalize_gender(raw: Optional[str]) -> str:
    if not raw:
        return "unknown"
    g = str(raw).strip().lower()
    if g in ("m", "male", "남", "남자", "남성", "1"):
        return "male"
    if g in ("f", "female", "여", "여자", "여성", "2"):
        return "female"
    return "unknown"


def _age_years(birth: date, ref: date) -> int:
    return ref.year - birth.year - ((ref.month, ref.day) < (birth.month, birth.day))


def _age_bucket(age_y: Optional[int]) -> str:
    if age_y is None:
        return "unknown"
    if age_y < 20:
        return "lt20"
    if age_y < 30:
        return "20s"
    if age_y < 40:
        return "30s"
    if age_y < 50:
        return "40s"
    if age_y < 60:
        return "50s"
    return "60p"


def _tenure_months(hire: date, ref: date, term: Optional[date]) -> Optional[int]:
    end = ref
    if term is not None and term < end:
        end = term
    if hire > end:
        return None
    days = (end - hire).days
    return max(0, days // 30)


def _tenure_years_float(hire: Optional[date], ref: date, term: Optional[date]) -> Optional[float]:
    if hire is None:
        return None
    end = ref
    if term is not None and term < end:
        end = term
    if hire > end:
        return None
    return round((end - hire).days / 365.25, 2)


def _tenure_bucket(months: Optional[int]) -> str:
    if months is None:
        return "unknown"
    if months < 12:
        return "lt1y"
    if months < 36:
        return "1to3y"
    if months < 60:
        return "3to5y"
    if months < 120:
        return "5to10y"
    return "10yp"


def _employee_headcount_at(e: Employee, period_end: date) -> bool:
    """period_end 시점에 재직 중이면 True (입사일 이전·퇴사일 이후는 False)."""
    if e.hire_date is None or e.hire_date > period_end:
        return False
    if e.termination_date is not None and e.termination_date <= period_end:
        return False
    return True


def _norm_employee_status(e: Employee) -> str:
    return (e.status or "").strip().casefold()


def _is_active_for_report(e: Employee, ref: date) -> bool:
    """스냅샷 기준 재직자: 월말 재직 로직과 동일 + 명시적 퇴직/비활성 상태 제외.

    status 미입력(NULL/공백)은 재직으로 간주(레거시·외부 연동 데이터 호환).
    """
    if not _employee_headcount_at(e, ref):
        return False
    st = _norm_employee_status(e)
    if st in ("terminated", "inactive"):
        return False
    return True


def _sorted_count_rows(counts: Dict[str, int], key_label: str) -> List[Dict[str, Any]]:
    rows = [{key_label: k, "count": v} for k, v in counts.items()]
    rows.sort(key=lambda x: (-x["count"], x[key_label]))
    return rows


def _build_nationality_label_map(
    db: Session,
    scope_company_ids: List[int],
) -> Dict[Tuple[int, str], str]:
    """회사별 국적 minor code/name -> 표시명 매핑."""
    if not scope_company_ids:
        return {}
    majors = (
        db.query(MajorCode)
        .filter(MajorCode.company_id.in_(scope_company_ids))
        .all()
    )
    kw = ("국적", "nationality", "สัญชาติ")
    nationality_major_ids: List[int] = []
    for m in majors:
        pool = f"{m.major_code} {(m.name_kor or '')} {(m.name_eng or '')} {(m.name_thai or '')}".casefold()
        if any(k in pool for k in kw):
            nationality_major_ids.append(int(m.id))
    if not nationality_major_ids:
        return {}
    rows = (
        db.query(MinorCode)
        .filter(
            MinorCode.company_id.in_(scope_company_ids),
            MinorCode.major_code_id.in_(nationality_major_ids),
        )
        .all()
    )
    out: Dict[Tuple[int, str], str] = {}
    for r in rows:
        label = ((r.name_kor or r.name_eng or r.name_thai or r.minor_code or "").strip()) or _UNASSIGNED
        keys = [r.minor_code, r.name_kor, r.name_eng, r.name_thai]
        for key in keys:
            k = (key or "").strip().casefold()
            if not k:
                continue
            out[(int(r.company_id), k)] = label
    return out


def build_hr_analytics_summary(
    db: Session,
    allowed_company_ids: List[int],
    company_id: Optional[int],
    trend_months: int = 12,
) -> Dict[str, Any]:
    if not allowed_company_ids:
        return _empty_summary(company_id)

    q = db.query(Employee).filter(Employee.company_id.in_(allowed_company_ids))
    if company_id is not None:
        q = q.filter(Employee.company_id == company_id)
    employees: List[Employee] = q.all()

    ref = date.today()
    months = max(6, min(36, trend_months))
    ym_list = _months_back(months, ref)

    monthly: List[Dict[str, Any]] = []
    for y, m in ym_list:
        end = _month_end(y, m)
        head = 0
        hires = 0
        terms = 0
        for e in employees:
            if e.hire_date is None:
                continue
            if e.hire_date <= end and (e.termination_date is None or e.termination_date > end):
                head += 1
            if e.hire_date.year == y and e.hire_date.month == m:
                hires += 1
            if e.termination_date is not None and e.termination_date.year == y and e.termination_date.month == m:
                terms += 1
        monthly.append(
            {
                "year": y,
                "month": m,
                "year_month": f"{y:04d}-{m:02d}",
                "headcount": head,
                "hires": hires,
                "terminations": terms,
            }
        )

    active = [e for e in employees if _is_active_for_report(e, ref)]

    scope_company_ids = (
        [company_id] if company_id is not None else list(dict.fromkeys(allowed_company_ids))
    )
    ref_by_id, label_maps = _load_reference_bundle(db, scope_company_ids)
    fk_ids: List[int] = []
    for e in employees:
        for attr in (
            "department_item_id",
            "employment_type_item_id",
            "work_status_item_id",
            "job_level_item_id",
            "position_item_id",
        ):
            v = getattr(e, attr, None)
            if v:
                fk_ids.append(int(v))
    _merge_reference_items_by_id(db, ref_by_id, label_maps, fk_ids)

    gender_totals = {"male": 0, "female": 0, "unknown": 0}
    age_order = ["lt20", "20s", "30s", "40s", "50s", "60p", "unknown"]
    age_gender: Dict[str, Dict[str, int]] = {b: {"male": 0, "female": 0, "unknown": 0} for b in age_order}

    tenure_buckets = {
        "lt1y": 0,
        "1to3y": 0,
        "3to5y": 0,
        "5to10y": 0,
        "10yp": 0,
        "unknown": 0,
    }

    emp_type_counts: Dict[str, int] = {}
    work_status_counts: Dict[str, int] = {}
    emp_work_matrix: Dict[Tuple[str, str], int] = {}
    job_level_tenure: Dict[str, List[float]] = {}
    position_tenure: Dict[str, List[float]] = {}
    nationality_counts: Dict[str, int] = {}

    active_nationality_by_emp_id: Dict[int, str] = {}
    active_company_by_emp_id: Dict[int, int] = {
        int(e.id): int(e.company_id)
        for e in active
        if getattr(e, "id", None) is not None and getattr(e, "company_id", None) is not None
    }
    active_ids = [e.id for e in active if getattr(e, "id", None) is not None]
    nationality_label_map = _build_nationality_label_map(db, scope_company_ids)
    if active_ids:
        rows = (
            db.query(EmployeePersonalInfo.employee_id, EmployeePersonalInfo.nationality)
            .filter(EmployeePersonalInfo.employee_id.in_(active_ids))
            .all()
        )
        for emp_id, raw_nat in rows:
            raw = (raw_nat or "").strip()
            if not raw:
                nat = _UNASSIGNED
            else:
                cid = active_company_by_emp_id.get(int(emp_id))
                if cid is None:
                    nat = raw
                else:
                    nat = nationality_label_map.get((cid, raw.casefold()), raw)
            active_nationality_by_emp_id[int(emp_id)] = nat

    for e in active:
        g = _normalize_gender(e.gender)
        gender_totals[g] += 1

        age_y: Optional[int] = None
        if e.birth_date is not None:
            age_y = _age_years(e.birth_date, ref)
        ab = _age_bucket(age_y)
        age_gender[ab][g] += 1

        svc_m = _tenure_months(e.hire_date, ref, None) if e.hire_date else None
        tenure_buckets[_tenure_bucket(svc_m)] += 1

        et = _resolve_ref_label(
            e, "employment_type", "employment_type_item_id", "employment_type", ref_by_id, label_maps, scope_company_ids
        )
        ws = _resolve_ref_label(
            e, "work_status", "work_status_item_id", "work_status", ref_by_id, label_maps, scope_company_ids
        )
        emp_type_counts[et] = emp_type_counts.get(et, 0) + 1
        work_status_counts[ws] = work_status_counts.get(ws, 0) + 1
        key_ew = (et, ws)
        emp_work_matrix[key_ew] = emp_work_matrix.get(key_ew, 0) + 1

        jl = _resolve_ref_label(
            e, "level", "job_level_item_id", "job_level", ref_by_id, label_maps, scope_company_ids
        )
        pos = _resolve_ref_label(
            e, "position", "position_item_id", "position", ref_by_id, label_maps, scope_company_ids
        )
        ty = _tenure_years_float(e.hire_date, ref, None)
        if ty is not None:
            job_level_tenure.setdefault(jl, []).append(ty)
            position_tenure.setdefault(pos, []).append(ty)
        nat = active_nationality_by_emp_id.get(e.id, _UNASSIGNED)
        nationality_counts[nat] = nationality_counts.get(nat, 0) + 1

    dept_counts: Dict[str, int] = {}
    dept_age_sum: Dict[str, int] = {}
    dept_age_n: Dict[str, int] = {}
    for e in active:
        d = _active_department_label(e, ref_by_id, label_maps, scope_company_ids)
        dept_counts[d] = dept_counts.get(d, 0) + 1
        if e.birth_date is not None:
            ay = _age_years(e.birth_date, ref)
            dept_age_sum[d] = dept_age_sum.get(d, 0) + ay
            dept_age_n[d] = dept_age_n.get(d, 0) + 1

    by_department = sorted(
        [{"department": k, "headcount": v} for k, v in dept_counts.items()],
        key=lambda x: (-x["headcount"], x["department"]),
    )

    term_by_dept: Dict[str, int] = {}
    for e in employees:
        td = e.termination_date
        if td is None or td > ref:
            continue
        if (ref - td).days > 365:
            continue
        d = _active_department_label(e, ref_by_id, label_maps, scope_company_ids)
        term_by_dept[d] = term_by_dept.get(d, 0) + 1

    department_workforce: List[Dict[str, Any]] = []
    for d, hc in sorted(dept_counts.items(), key=lambda x: (-x[1], x[0])):
        n_age = dept_age_n.get(d, 0)
        avg_age = round(dept_age_sum[d] / n_age, 1) if n_age else None
        t12 = term_by_dept.get(d, 0)
        denom = max(hc, 1)
        turnover_pct = round(100.0 * t12 / denom, 2)
        department_workforce.append(
            {
                "department": d,
                "headcount": hc,
                "avg_age": avg_age,
                "terminations_12m": t12,
                "turnover_rate_pct": turnover_pct,
            }
        )

    by_employment_type = _sorted_count_rows(emp_type_counts, "label")
    by_work_status = _sorted_count_rows(work_status_counts, "label")
    by_nationality = _sorted_count_rows(nationality_counts, "label")
    employment_work_matrix = sorted(
        [
            {"employment_type": a, "work_status": b, "count": c}
            for (a, b), c in emp_work_matrix.items()
        ],
        key=lambda x: (-x["count"], x["employment_type"], x["work_status"]),
    )

    # Recompute job_level / position with correct headcount (all active in label)
    jl_counts: Dict[str, int] = {}
    pos_counts: Dict[str, int] = {}
    for e in active:
        jl = _resolve_ref_label(
            e, "level", "job_level_item_id", "job_level", ref_by_id, label_maps, scope_company_ids
        )
        pos = _resolve_ref_label(
            e, "position", "position_item_id", "position", ref_by_id, label_maps, scope_company_ids
        )
        jl_counts[jl] = jl_counts.get(jl, 0) + 1
        pos_counts[pos] = pos_counts.get(pos, 0) + 1

    by_job_level: List[Dict[str, Any]] = []
    for lab, hc in sorted(jl_counts.items(), key=lambda x: (-x[1], x[0])):
        vals = job_level_tenure.get(lab, [])
        by_job_level.append(
            {
                "label": lab,
                "headcount": hc,
                "avg_tenure_years": round(sum(vals) / len(vals), 2) if vals else None,
            }
        )

    by_position: List[Dict[str, Any]] = []
    for lab, hc in sorted(pos_counts.items(), key=lambda x: (-x[1], x[0])):
        vals = position_tenure.get(lab, [])
        by_position.append(
            {
                "label": lab,
                "headcount": hc,
                "avg_tenure_years": round(sum(vals) / len(vals), 2) if vals else None,
            }
        )

    min_cohort_y = ref.year - 35
    cohort_years = sorted(
        {e.hire_date.year for e in employees if e.hire_date and e.hire_date.year >= min_cohort_y}
    )
    hire_cohort_summary: List[Dict[str, Any]] = []
    hire_cohort_survival: List[Dict[str, Any]] = []
    for cy in cohort_years:
        members = [e for e in employees if e.hire_date and e.hire_date.year == cy]
        hired_total = len(members)
        if hired_total == 0:
            continue
        still_active = sum(1 for m in members if _is_active_for_report(m, ref))
        ret_pct = round(100.0 * still_active / hired_total, 2) if hired_total else 0.0
        hire_cohort_summary.append(
            {
                "hire_year": cy,
                "hired_total": hired_total,
                "still_active": still_active,
                "retention_pct": ret_pct,
            }
        )
        points: List[Dict[str, Any]] = []
        for cal_y in range(cy, ref.year + 1):
            period_end = min(date(cal_y, 12, 31), ref)
            cnt = sum(1 for m in members if _employee_headcount_at(m, period_end))
            points.append({"year": cal_y, "headcount": cnt})
        hire_cohort_survival.append({"hire_year": cy, "points": points})

    hire_cohort_summary.sort(key=lambda x: -x["hire_year"])

    return {
        "as_of": ref.isoformat(),
        "company_id": company_id,
        "monthly_trend": monthly,
        "gender_totals": gender_totals,
        "age_gender": [{"age_bucket": k, **v} for k, v in age_gender.items()],
        "tenure_buckets": tenure_buckets,
        "by_department": by_department,
        "by_employment_type": by_employment_type,
        "by_work_status": by_work_status,
        "by_nationality": by_nationality,
        "employment_work_matrix": employment_work_matrix,
        "by_job_level": by_job_level,
        "by_position": by_position,
        "hire_cohort_summary": hire_cohort_summary,
        "hire_cohort_survival": hire_cohort_survival,
        "department_workforce": department_workforce,
        "terminations_window_days": 365,
        "totals": {
            "employees_all": len(employees),
            "employees_active": len(active),
        },
    }


def _empty_summary(company_id: Optional[int]) -> Dict[str, Any]:
    return {
        "as_of": date.today().isoformat(),
        "company_id": company_id,
        "monthly_trend": [],
        "gender_totals": {"male": 0, "female": 0, "unknown": 0},
        "age_gender": [],
        "tenure_buckets": {
            "lt1y": 0,
            "1to3y": 0,
            "3to5y": 0,
            "5to10y": 0,
            "10yp": 0,
            "unknown": 0,
        },
        "by_department": [],
        "by_employment_type": [],
        "by_work_status": [],
        "by_nationality": [],
        "employment_work_matrix": [],
        "by_job_level": [],
        "by_position": [],
        "hire_cohort_summary": [],
        "hire_cohort_survival": [],
        "department_workforce": [],
        "terminations_window_days": 365,
        "totals": {"employees_all": 0, "employees_active": 0},
    }
