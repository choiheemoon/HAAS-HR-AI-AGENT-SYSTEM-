"""시스템 관리 API (사용자·권한그룹·메뉴 권한·스케줄)."""
import json
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from pydantic import BaseModel

from app.database import SessionLocal, get_db
from app.api.deps import require_system_admin
from app.services.system_rbac_service import SystemRbacService
from app.services.onboarding_setup_service import OnboardingSetupService
from app.models.user import User
from app.config import settings
from app.utils.email_sender import send_email
from app.schemas.system_rbac import (
    PermissionGroupCreate,
    PermissionGroupUpdate,
    PermissionGroupResponse,
    AppMenuResponse,
    MenuPermissionRow,
    GroupMenuPermissionsPut,
    AdminUserResponse,
    AdminUserCreate,
    AdminUserUpdate,
    UserCompanyIdsPut,
)
from app.schemas.job_schedule import (
    JobScheduleCreate,
    JobScheduleListResponse,
    JobScheduleResponse,
    JobScheduleRunNowResponse,
    JobScheduleRunResponse,
    JobScheduleUpdate,
)
from app.services.job_schedule_service import JobScheduleService

router = APIRouter(dependencies=[Depends(require_system_admin)])


class TemplateGenerationRequest(BaseModel):
    source_company_id: int
    target_company_id: int | None = None
    create_new_company: bool = False
    major_minor_codes: bool = True
    hr_reference: bool = True
    attendance_reference: bool = True
    system_rbac: bool = True


class SmtpTestRequest(BaseModel):
    to_email: str | None = None
    subject: str | None = None
    body: str | None = None


class SmtpTestResponse(BaseModel):
    ok: bool
    to_email: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_from: str
    smtp_use_tls: bool
    message: str


def _svc(db: Session) -> SystemRbacService:
    return SystemRbacService(db)


def _run_schedule_background(schedule_id: int, trigger: str) -> None:
    """요청 타임아웃을 피하기 위해 즉시실행을 백그라운드로 수행."""
    db = SessionLocal()
    try:
        JobScheduleService(db).execute_schedule(int(schedule_id), trigger=trigger)
    finally:
        db.close()


# —— 메뉴(시드) ——
@router.get("/menus", response_model=List[AppMenuResponse])
def list_menus(db: Session = Depends(get_db)):
    _svc(db).seed_menus_if_needed()
    return _svc(db).list_menus()


# —— 권한 그룹 ——
@router.get("/permission-groups", response_model=List[PermissionGroupResponse])
def list_permission_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    return _svc(db).list_groups(current_user=current_user)


@router.post("/permission-groups", response_model=PermissionGroupResponse)
def create_permission_group(
    body: PermissionGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return _svc(db).create_group(body.model_dump(), current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="그룹 코드가 중복됩니다.") from e


@router.put("/permission-groups/{group_id}", response_model=PermissionGroupResponse)
def update_permission_group(
    group_id: int,
    body: PermissionGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return _svc(db).update_group(
            group_id, body.model_dump(exclude_unset=True), current_user=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/permission-groups/{group_id}")
def delete_permission_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).delete_group(group_id, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


# —— 그룹별 메뉴·CRUD 권한 ——
@router.get(
    "/permission-groups/{group_id}/menu-permissions",
    response_model=List[MenuPermissionRow],
)
def get_group_menu_permissions(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        rows = _svc(db).get_group_menu_matrix(group_id, current_user=current_user)
        return [MenuPermissionRow(**r) for r in rows]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/permission-groups/{group_id}/menu-permissions")
def put_group_menu_permissions(
    group_id: int,
    body: GroupMenuPermissionsPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).put_group_menu_matrix(
            group_id,
            [i.model_dump() for i in body.items],
            current_user=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


# —— 사용자 관리 ——
@router.get("/users", response_model=List[AdminUserResponse])
def list_system_users(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    return _svc(db).list_users(current_user=current_user, company_id=company_id)


@router.post("/users", response_model=AdminUserResponse)
def create_system_user(
    body: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        u = _svc(db).create_user(body.model_dump(), current_user=current_user)
        return u
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="이메일 또는 사용자명이 중복됩니다.") from e


@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_system_user(
    user_id: int,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    data = body.model_dump(exclude_unset=True)
    if not data.get("password"):
        data.pop("password", None)
    try:
        return _svc(db).update_user(user_id, data, current_user=current_user)
    except ValueError as e:
        msg = str(e)
        if "사용자를 찾을 수 없습니다" in msg or "로그인 사용자를 찾을 수 없습니다" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.delete("/users/{user_id}")
def deactivate_system_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).deactivate_user(user_id, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


@router.get("/users/{user_id}/companies")
def get_user_company_access(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        ids = _svc(db).get_user_company_ids(user_id, current_user=current_user)
        return {"company_ids": ids}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/users/{user_id}/companies")
def put_user_company_access(
    user_id: int,
    body: UserCompanyIdsPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).set_user_companies(
            user_id, body.company_ids, current_user=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.post("/template-generation")
def run_template_generation(
    body: TemplateGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return OnboardingSetupService(db).run_template_generation(
            current_user,
            source_company_id=int(body.source_company_id),
            target_company_id=int(body.target_company_id) if body.target_company_id else None,
            create_new_company=bool(body.create_new_company),
            options={
                "major_minor_codes": bool(body.major_minor_codes),
                "hr_reference": bool(body.hr_reference),
                "attendance_reference": bool(body.attendance_reference),
                "system_rbac": bool(body.system_rbac),
            },
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"템플릿 생성(기준정보) 중 오류가 발생했습니다: {str(e)}"
        ) from e


def _schedule_to_response(row) -> JobScheduleResponse:
    payload = {}
    try:
        if row.payload_json:
            v = json.loads(row.payload_json)
            payload = v if isinstance(v, dict) else {}
    except Exception:
        payload = {}
    return JobScheduleResponse(
        id=int(row.id),
        name=row.name,
        job_type=row.job_type,
        enabled=bool(row.enabled),
        time_local=row.time_local,
        timezone=row.timezone,
        weekdays_mask=int(row.weekdays_mask),
        run_as_user_id=int(row.run_as_user_id),
        company_id=row.company_id,
        payload=payload,
        last_run_at=row.last_run_at,
        next_run_at=row.next_run_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _run_to_response(row) -> JobScheduleRunResponse:
    result = {}
    try:
        if row.result_json:
            v = json.loads(row.result_json)
            result = v if isinstance(v, dict) else {}
    except Exception:
        result = {}
    return JobScheduleRunResponse(
        id=int(row.id),
        schedule_id=int(row.schedule_id),
        status=row.status,
        started_at=row.started_at,
        finished_at=row.finished_at,
        message=row.message,
        result=result,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/job-schedules", response_model=JobScheduleListResponse)
def list_job_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    svc = JobScheduleService(db)
    items = [_schedule_to_response(r) for r in svc.list_schedules()]
    return JobScheduleListResponse(items=items)


@router.post("/job-schedules", response_model=JobScheduleResponse)
def create_job_schedule(
    body: JobScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        row = JobScheduleService(db).create_schedule(body.model_dump())
        return _schedule_to_response(row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/job-schedules/{schedule_id}", response_model=JobScheduleResponse)
def update_job_schedule(
    schedule_id: int,
    body: JobScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        row = JobScheduleService(db).update_schedule(schedule_id, body.model_dump(exclude_unset=True))
        return _schedule_to_response(row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/job-schedules/{schedule_id}")
def delete_job_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        JobScheduleService(db).delete_schedule(schedule_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/job-schedules/{schedule_id}/runs", response_model=list[JobScheduleRunResponse])
def list_job_schedule_runs(
    schedule_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    rows = JobScheduleService(db).list_runs(schedule_id, limit=limit)
    return [_run_to_response(r) for r in rows]


@router.post("/job-schedules/{schedule_id}/run-now", response_model=JobScheduleRunNowResponse)
def run_job_schedule_now(
    schedule_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    svc = JobScheduleService(db)
    rows = svc.list_schedules()
    target = next((r for r in rows if int(r.id) == int(schedule_id)), None)
    if target is None:
        raise HTTPException(status_code=404, detail="스케줄을 찾을 수 없습니다.")
    # 근태/OT/수당 집계는 실행 시간이 길어 HTTP 타임아웃이 발생할 수 있어 비동기 처리한다.
    # 실행 결과(성공/실패)는 JobScheduleRun 이력으로 저장된다.
    if str(target.job_type) == "attendance_ot_allowance_aggregate":
        background_tasks.add_task(_run_schedule_background, int(schedule_id), "manual_api_bg")
        return JobScheduleRunNowResponse(ok=True, schedule_id=int(schedule_id), message="queued")
    try:
        svc.execute_schedule(int(schedule_id), trigger="manual_api")
        return JobScheduleRunNowResponse(ok=True, schedule_id=int(schedule_id), message="completed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/email/test", response_model=SmtpTestResponse)
def send_smtp_test_email(
    body: SmtpTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    to_email = (body.to_email or settings.SMTP_USER or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="수신 이메일(to_email)이 비어 있습니다.")
    subject = (body.subject or "[HR AI AGENT] SMTP 연결 테스트").strip()
    msg_body = (body.body or "이 메일은 시스템관리 > SMTP 테스트 엔드포인트에서 발송되었습니다.").strip()
    try:
        send_email(to_email, subject, msg_body)
        return SmtpTestResponse(
            ok=True,
            to_email=to_email,
            smtp_host=str(settings.SMTP_HOST or ""),
            smtp_port=int(settings.SMTP_PORT),
            smtp_user=str(settings.SMTP_USER or ""),
            smtp_from=str(settings.SMTP_FROM or settings.SMTP_USER or ""),
            smtp_use_tls=bool(settings.SMTP_USE_TLS),
            message="SMTP test email sent",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
