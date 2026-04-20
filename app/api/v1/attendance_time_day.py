"""일별 근태 집계 결과 조회/수정 API (근태현황관리)."""
import json
from datetime import date
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.attendance_aggregate_service import AttendanceAggregateService
from app.services.attendance_time_day_service import AttendanceTimeDayService

router = APIRouter()


def _pd(v: Optional[str]) -> Optional[date]:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _work_dates_from_body(body: Dict[str, Any]) -> Optional[Set[date]]:
    """선택: 특정 근무일만 집계(근태/OT/수당관리 화면 등)."""
    wd_raw = body.get("work_dates")
    if wd_raw is None:
        return None
    if not isinstance(wd_raw, list):
        raise HTTPException(status_code=400, detail="work_dates는 날짜 문자열 배열이어야 합니다.")
    out: Set[date] = set()
    for x in wd_raw:
        d = _pd(str(x) if x is not None else "")
        if d:
            out.add(d)
    if not out:
        raise HTTPException(status_code=400, detail="work_dates에 유효한 날짜(YYYY-MM-DD)가 없습니다.")
    return out


@router.get("/time-day", response_model=Dict[str, List[Dict[str, Any]]])
def list_time_day(
    employee_id: int = Query(..., ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        items = AttendanceTimeDayService(db).list_for_employee(
            employee_id,
            current_user,
            _pd(date_from),
            _pd(date_to),
        )
        return {"items": items}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/time-day/all", response_model=Dict[str, Any])
def list_time_day_all(
    company_id: Optional[int] = Query(None, ge=1),
    employee_id: Optional[int] = Query(None, ge=1),
    department: Optional[str] = Query(None),
    status: str = Query("active"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    search_value: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return AttendanceTimeDayService(db).list_all_for_period(
        user=current_user,
        company_id=company_id,
        employee_id=employee_id,
        department=department,
        status=status,
        search=search,
        search_field=search_field,
        search_value=search_value,
        date_from=_pd(date_from),
        date_to=_pd(date_to),
        page=page,
        page_size=page_size,
    )


@router.get("/time-day/report-summary", response_model=Dict[str, Any])
def get_time_day_report_summary(
    company_id: Optional[int] = Query(None, ge=1),
    employee_id: Optional[int] = Query(None, ge=1),
    department: Optional[str] = Query(None),
    status: str = Query("active"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    search_value: Optional[str] = Query(None),
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """`attendance_time_day` 기준 OT·수당 집계 — 부서별 요약 및 OT 구간 합계."""
    df = _pd(date_from)
    dt = _pd(date_to)
    if not df or not dt:
        raise HTTPException(status_code=400, detail="date_from, date_to (YYYY-MM-DD)가 필요합니다.")
    if df > dt:
        raise HTTPException(status_code=400, detail="date_from이 date_to보다 늦을 수 없습니다.")
    try:
        return AttendanceTimeDayService(db).ot_allowance_report_summary(
            current_user,
            company_id=company_id,
            employee_id=employee_id,
            department=(department or "").strip() or None,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=df,
            date_to=dt,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/time-day/report-trends", response_model=Dict[str, Any])
def get_time_day_report_trends(
    company_id: Optional[int] = Query(None, ge=1),
    employee_id: Optional[int] = Query(None, ge=1),
    department: Optional[str] = Query(None),
    status: str = Query("active"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    search_value: Optional[str] = Query(None),
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """동일 필터 기준 OT 구간(분)·OT금액(othb) 일별·월별 추이."""
    df = _pd(date_from)
    dt = _pd(date_to)
    if not df or not dt:
        raise HTTPException(status_code=400, detail="date_from, date_to (YYYY-MM-DD)가 필요합니다.")
    if df > dt:
        raise HTTPException(status_code=400, detail="date_from이 date_to보다 늦을 수 없습니다.")
    try:
        return AttendanceTimeDayService(db).ot_allowance_report_trends(
            current_user,
            company_id=company_id,
            employee_id=employee_id,
            department=(department or "").strip() or None,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=df,
            date_to=dt,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/time-day/aggregate", response_model=Dict[str, Any])
def run_time_day_aggregate(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """기간·회사·직원 범위로 타각·근태기준·마스터를 반영해 `attendance_time_day`를 일괄 UPSERT."""
    df = _pd(body.get("date_from"))
    dt = _pd(body.get("date_to"))
    if not df or not dt:
        raise HTTPException(status_code=400, detail="date_from, date_to (YYYY-MM-DD)가 필요합니다.")
    raw_co = body.get("company_id")
    company_id: Optional[int] = None
    if raw_co is not None and str(raw_co).strip() != "":
        try:
            company_id = int(raw_co)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="company_id는 정수여야 합니다.") from None
        if company_id < 1:
            raise HTTPException(status_code=400, detail="company_id는 1 이상이어야 합니다.")
    eids_raw = body.get("employee_ids")
    employee_ids: Optional[List[int]] = None
    if eids_raw is not None:
        if not isinstance(eids_raw, list):
            raise HTTPException(status_code=400, detail="employee_ids는 정수 배열이어야 합니다.")
        try:
            employee_ids = [int(x) for x in eids_raw]
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="employee_ids 항목은 정수여야 합니다.") from None
    work_dates_set = _work_dates_from_body(body)
    try:
        return AttendanceAggregateService(db).run(
            current_user,
            date_from=df,
            date_to=dt,
            company_id=company_id,
            employee_ids=employee_ids,
            work_dates=work_dates_set,
        )
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg or "없습니다" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.post("/time-day/aggregate-stream")
def run_time_day_aggregate_stream(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """NDJSON 스트림: `progress` 행(직원 처리 진행률) 후 마지막에 `done` 또는 `error` 한 줄."""
    df = _pd(body.get("date_from"))
    dt = _pd(body.get("date_to"))
    if not df or not dt:
        raise HTTPException(status_code=400, detail="date_from, date_to (YYYY-MM-DD)가 필요합니다.")
    raw_co = body.get("company_id")
    company_id: Optional[int] = None
    if raw_co is not None and str(raw_co).strip() != "":
        try:
            company_id = int(raw_co)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="company_id는 정수여야 합니다.") from None
        if company_id < 1:
            raise HTTPException(status_code=400, detail="company_id는 1 이상이어야 합니다.")
    eids_raw = body.get("employee_ids")
    employee_ids: Optional[List[int]] = None
    if eids_raw is not None:
        if not isinstance(eids_raw, list):
            raise HTTPException(status_code=400, detail="employee_ids는 정수 배열이어야 합니다.")
        try:
            employee_ids = [int(x) for x in eids_raw]
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="employee_ids 항목은 정수여야 합니다.") from None
    work_dates_set = _work_dates_from_body(body)

    def ndjson_iter():
        try:
            for ev in AttendanceAggregateService(db).iter_run(
                current_user,
                date_from=df,
                date_to=dt,
                company_id=company_id,
                employee_ids=employee_ids,
                work_dates=work_dates_set,
            ):
                yield (json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8")
        except ValueError as e:
            err = {"type": "error", "detail": str(e)}
            yield (json.dumps(err, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(
        ndjson_iter(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/time-day", response_model=Dict[str, Any])
def create_time_day(
    employee_id: int = Query(..., ge=1),
    body: Dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceTimeDayService(db).create(employee_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.put("/time-day/{record_id}", response_model=Dict[str, Any])
def update_time_day(
    record_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceTimeDayService(db).update(record_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.delete("/time-day/{record_id}")
def delete_time_day(
    record_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        AttendanceTimeDayService(db).delete(record_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": record_id}
