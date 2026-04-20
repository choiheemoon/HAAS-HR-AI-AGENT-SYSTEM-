"""회사별 인사기준정보 공통 API"""

from collections import defaultdict
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, literal, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.employee_type import EmployeeType
from app.models.employee import Employee
from app.schemas.employee_reference_item import (
    EmployeeReferenceItemCreate,
    EmployeeReferenceItemResponse,
    EmployeeReferenceItemUpdate,
)
from app.services.employee_reference_item_service import EmployeeReferenceItemService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def _allowed_company_ids(current_user, db: Session) -> List[int]:
    rbac = SystemRbacService(db)
    return rbac.get_user_company_ids(current_user.id, current_user=current_user)


def _employee_column_for_reference_category(category: str):
    """인사기준정보 category → employees 테이블 컬럼 매핑(없으면 None)."""
    m = {
        "department": Employee.department,
        "level": Employee.job_level,
        "position": Employee.position,
        "employment_type": Employee.employment_type,
        "employee_type": Employee.salary_process_type,
        "division": Employee.division,
        "work_place": Employee.work_place,
        "area": Employee.area,
        "work_status": Employee.work_status,
        "employee_level": Employee.employee_level,
    }
    return m.get(category)


def _employee_company_scope(company_id: int):
    """삭제 검사 시 회사 스코프.
    DB에 company_id가 비어 있는 레거시 직원은 특정 회사 필터에 걸리지 않아 오삭제가 나기 쉬우므로,
    동일 조건(코드/명칭)이면 사용 중으로 간주합니다.
    """
    return or_(Employee.company_id == company_id, Employee.company_id.is_(None))


def _column_matches_reference_usage(col, ref_row: EmployeeReferenceItem):
    """인사 필드에 코드만, 명칭만, '코드 명칭' 형태로 저장된 경우까지 감지."""
    parts = []
    code = (ref_row.code or "").strip()
    if code:
        ck = code.casefold()
        parts.append(
            and_(col.isnot(None), func.lower(func.trim(col)) == ck),
        )
        parts.append(
            and_(col.isnot(None), func.lower(func.trim(col)).like(ck + " %")),
        )
        parts.append(
            and_(col.isnot(None), func.lower(func.trim(col)).like(ck + "-%")),
        )
    for attr in ("name_kor", "name_eng", "name_thai"):
        raw = getattr(ref_row, attr, None)
        if raw is None:
            continue
        nk = str(raw).strip()
        if len(nk) < 2:
            continue
        nkf = nk.casefold()
        lit_name = literal(nk)
        emp_lc = func.lower(func.trim(col))
        parts.append(
            and_(col.isnot(None), func.lower(func.trim(col)) == nkf),
        )
        parts.append(
            and_(col.isnot(None), func.lower(col).like("%" + nkf + "%")),
        )
        # 기준정보 명칭이 직원 입력값을 포함(직원 값이 접두/부분 문자열) — 화면 표시·수기 입력 불일치 대응
        if len(nkf) >= 4:
            parts.append(
                and_(
                    col.isnot(None),
                    func.length(func.trim(col)) >= 4,
                    func.lower(lit_name).like(func.concat("%", emp_lc, "%")),
                ),
            )
            parts.append(
                and_(
                    col.isnot(None),
                    func.length(func.trim(col)) >= 4,
                    func.lower(lit_name).like(func.concat(emp_lc, "%")),
                ),
            )
    return or_(*parts) if parts else None


def _employee_count_using_reference_item(
    db: Session,
    *,
    company_id: int,
    category: str,
    ref_row: EmployeeReferenceItem,
) -> int:
    """
    동일 회사 직원 인사정보에서 이 기준정보(코드·명칭)가 쓰이면 삭제 불가.
    - 매핑된 category: 해당 컬럼만 검사(코드 + 다국어명).
    - 그 외(알 수 없는 category): 주요 코드·확장 컬럼 전체 검사.
    """
    mapped = _employee_column_for_reference_category(category)
    if mapped is not None:
        cols = [mapped]
    else:
        cols = [
            Employee.department,
            Employee.job_level,
            Employee.position,
            Employee.employment_type,
            Employee.salary_process_type,
            Employee.division,
            Employee.work_place,
            Employee.area,
            Employee.work_status,
            Employee.employee_level,
        ]

    exprs = []
    for col in cols:
        m = _column_matches_reference_usage(col, ref_row)
        if m is not None:
            exprs.append(m)

    if not exprs:
        return 0

    return (
        db.query(Employee)
        .filter(_employee_company_scope(company_id))
        .filter(or_(*exprs))
        .count()
    )


def _employee_count_by_reference_fks(db: Session, item_id: int) -> int:
    """employees 테이블의 인사기준정보 FK가 이 행을 직접 가리키는지 여부."""
    return (
        db.query(Employee)
        .filter(
            or_(
                Employee.department_item_id == item_id,
                Employee.job_level_item_id == item_id,
                Employee.position_item_id == item_id,
                Employee.employment_type_item_id == item_id,
                Employee.salary_process_type_item_id == item_id,
                Employee.division_item_id == item_id,
                Employee.work_place_item_id == item_id,
                Employee.area_item_id == item_id,
                Employee.work_status_item_id == item_id,
                Employee.employee_level_item_id == item_id,
            )
        )
        .count()
    )


def _sync_employee_type_if_needed(db: Session, company_id: int) -> None:
    """
    employee_types 테이블에 이미 데이터가 있을 수 있으므로,
    category=employee_type 으로 employee_reference_items를 자동 동기화합니다.
    """
    # employee_types에서 복사 (있을 때만)
    rows = (
        db.query(EmployeeType)
        .filter(EmployeeType.company_id == company_id)
        .order_by(EmployeeType.employee_type_code.asc())
        .all()
    )
    if not rows:
        return

    svc = EmployeeReferenceItemService(db)
    for r in rows:
        ref_row = (
            db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .filter(EmployeeReferenceItem.category == "employee_type")
            .filter(EmployeeReferenceItem.code == r.employee_type_code)
            .first()
        )
        if ref_row:
            ref_row.name_kor = r.name_kor
            ref_row.name_eng = r.name_eng
            ref_row.name_thai = r.name_thai
        else:
            svc.create(
                {
                    "company_id": company_id,
                    "category": "employee_type",
                    "code": r.employee_type_code,
                    "name_kor": r.name_kor,
                    "name_eng": r.name_eng,
                    "name_thai": r.name_thai,
                }
            )
    db.commit()


@router.get(
    "/by-company/{company_id}/all-categories",
    response_model=Dict[str, List[EmployeeReferenceItemResponse]],
)
@router.get(
    "/by-company/{company_id}/all-categories/",
    response_model=Dict[str, List[EmployeeReferenceItemResponse]],
)
def list_all_reference_categories_for_company(
    company_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """인사마스터 조회 등: 회사당 category별 GET 반복 대신 1회로 전체 기준정보 로드."""
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")
    _sync_employee_type_if_needed(db, company_id)
    rows = EmployeeReferenceItemService(db).list_all_for_company(company_id)
    grouped: Dict[str, List[EmployeeReferenceItemResponse]] = defaultdict(list)
    for row in rows:
        grouped[row.category].append(EmployeeReferenceItemResponse.model_validate(row))
    return dict(grouped)


@router.get("", response_model=List[EmployeeReferenceItemResponse])
@router.get("/", response_model=List[EmployeeReferenceItemResponse])
def list_employee_reference_items(
    category: str,
    company_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    if category == "employee_type":
        _sync_employee_type_if_needed(db, company_id)

    return EmployeeReferenceItemService(db).list(company_id=company_id, category=category)


@router.get("/{item_id}", response_model=EmployeeReferenceItemResponse)
@router.get("/{item_id}/", response_model=EmployeeReferenceItemResponse)
def get_employee_reference_item(
    category: str,
    item_id: int,
    company_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    if category == "employee_type":
        _sync_employee_type_if_needed(db, company_id)

    row = EmployeeReferenceItemService(db).get(company_id=company_id, category=category, item_id=item_id)
    if not row:
        raise HTTPException(status_code=404, detail="기준정보를 찾을 수 없습니다.")
    return row


@router.post("", response_model=EmployeeReferenceItemResponse)
@router.post("/", response_model=EmployeeReferenceItemResponse)
def create_employee_reference_item(
    category: str,
    body: EmployeeReferenceItemCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if body.company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    # category는 body.category 대신 query의 category를 신뢰해서 통일
    payload: Dict[str, str | int | None] = {
        "company_id": body.company_id,
        "category": category,
        "code": body.code,
        "name_kor": body.name_kor,
        "name_eng": body.name_eng,
        "name_thai": body.name_thai,
    }

    # employee_type 은 employee_types 테이블에도 동기화
    if category == "employee_type":
        # 먼저 employee_reference_items 저장
        try:
            created = EmployeeReferenceItemService(db).create(payload)  # type: ignore[arg-type]
        except IntegrityError as e:
            raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e

        # employee_types도 동일하게 upsert
        try:
            et_code = payload["code"]
            row = db.query(EmployeeType).filter(
                EmployeeType.company_id == body.company_id,
                EmployeeType.employee_type_code == et_code,
            ).first()
            if row:
                row.name_kor = body.name_kor
                row.name_eng = body.name_eng
                row.name_thai = body.name_thai
            else:
                db.add(
                    EmployeeType(
                        company_id=body.company_id,
                        employee_type_code=et_code,
                        name_kor=body.name_kor,
                        name_eng=body.name_eng,
                        name_thai=body.name_thai,
                    )
                )
            db.commit()
        except Exception:
            # employee_types 동기화 실패는 reference쪽은 유지
            db.rollback()
        return created

    try:
        return EmployeeReferenceItemService(db).create(payload)  # type: ignore[arg-type]
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e


@router.put("/{item_id}", response_model=EmployeeReferenceItemResponse)
@router.put("/{item_id}/", response_model=EmployeeReferenceItemResponse)
def update_employee_reference_item(
    category: str,
    item_id: int,
    company_id: int,
    body: EmployeeReferenceItemUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    if category == "employee_type":
        _sync_employee_type_if_needed(db, company_id)

    payload = body.model_dump(exclude_unset=True)

    try:
        updated = EmployeeReferenceItemService(db).update(
            company_id=company_id,
            category=category,
            item_id=item_id,
            data=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    # employee_type 동기화(코드/회사 변경 불가)
    if category == "employee_type":
        try:
            ref_row = db.query(EmployeeReferenceItem).filter(
                EmployeeReferenceItem.id == item_id,
                EmployeeReferenceItem.company_id == company_id,
                EmployeeReferenceItem.category == "employee_type",
            ).first()
            if ref_row:
                et_code = ref_row.code
                et = db.query(EmployeeType).filter(
                    EmployeeType.company_id == company_id,
                    EmployeeType.employee_type_code == et_code,
                ).first()
                if et:
                    if "name_kor" in payload:
                        et.name_kor = payload.get("name_kor")
                    if "name_eng" in payload:
                        et.name_eng = payload.get("name_eng")
                    if "name_thai" in payload:
                        et.name_thai = payload.get("name_thai")
                    db.commit()
        except Exception:
            db.rollback()

    return updated


@router.delete("/{item_id}")
@router.delete("/{item_id}/")
def delete_employee_reference_item(
    category: str,
    item_id: int,
    company_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _allowed_company_ids(current_user, db)
    if company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    if category == "employee_type":
        _sync_employee_type_if_needed(db, company_id)

    code_before: Optional[str] = None
    ref_for_delete = EmployeeReferenceItemService(db).get(
        company_id=company_id, category=category, item_id=item_id
    )
    if not ref_for_delete:
        raise HTTPException(status_code=404, detail="기준정보를 찾을 수 없습니다.")

    if category == "employee_type":
        code_before = ref_for_delete.code

    in_use = _employee_count_using_reference_item(
        db,
        company_id=company_id,
        category=category,
        ref_row=ref_for_delete,
    )
    fk_in_use = _employee_count_by_reference_fks(db, ref_for_delete.id)
    if in_use > 0 or fk_in_use > 0:
        raise HTTPException(
            status_code=409,
            detail="해당 코드는 직원 인사정보에서 사용 중이라 삭제할 수 없습니다.",
        )

    try:
        EmployeeReferenceItemService(db).delete(
            company_id=company_id,
            category=category,
            item_id=item_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="해당 코드는 직원 인사정보에서 사용 중이라 삭제할 수 없습니다.",
        ) from e

    # employee_type 동기화(참고: employee_types 삭제는 동일 코드로 처리)
    if category == "employee_type":
        try:
            if code_before:
                et = (
                    db.query(EmployeeType)
                    .filter(EmployeeType.company_id == company_id)
                    .filter(EmployeeType.employee_type_code == code_before)
                    .first()
                )
                if et:
                    db.delete(et)
                    db.commit()
        except Exception:
            db.rollback()

    return {"ok": True, "id": item_id}

