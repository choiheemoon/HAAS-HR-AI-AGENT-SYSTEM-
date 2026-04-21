"""회원가입 후 환경설정 일괄 생성 서비스."""
from __future__ import annotations

from typing import Any, Dict
from datetime import datetime, timedelta
import calendar

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import text

from app.models.company import Company
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.user import User
from app.models.user_company_access import UserCompanyAccess
from app.models.rbac import AppMenu, GroupMenuPermission, PermissionGroup
from app.services.attendance_standard_service import AttendanceStandardService
from app.services.system_rbac_service import SystemRbacService


class OnboardingSetupService:
    """회원가입 직후 기본 기준정보를 템플릿 회사(AAA)에서 복제한다."""

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _is_excluded_template_code(code: Any) -> bool:
        return str(code or "").strip().upper() == "AAA"

    def _ensure_company_code_index_compat(self) -> None:
        """
        레거시 DB에 남아있는 company_code 단독 유니크 인덱스를 정리합니다.
        요구사항은 (system_group_code, company_code) 복합 유니크이므로 단독 유니크는 충돌 원인입니다.
        """
        self.db.execute(
            text(
                """
DO $$
DECLARE v_is_unique boolean;
BEGIN
  SELECT i.indisunique INTO v_is_unique
  FROM pg_class c
  JOIN pg_index i ON i.indexrelid = c.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'ix_companies_company_code'
    AND n.nspname = 'public'
  LIMIT 1;

  IF COALESCE(v_is_unique, false) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.ix_companies_company_code';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_companies_company_code ON public.companies(company_code)';
  END IF;
END $$;
"""
            )
        )

    def _get_template_company(self) -> Company:
        row = (
            self.db.query(Company)
            .filter(Company.company_code == "AAA")
            .order_by(Company.id.asc())
            .first()
        )
        if not row:
            raise ValueError("템플릿 회사(AAA)를 찾을 수 없습니다.")
        return row

    def _get_admin_user(self) -> User:
        row = (
            self.db.query(User)
            .filter(User.username == "admin")
            .order_by(User.id.asc())
            .first()
        )
        if not row:
            raise ValueError("admin 계정을 찾을 수 없습니다.")
        return row

    def _get_admin_template_group(self, admin_user: User) -> PermissionGroup:
        group: PermissionGroup | None = None
        if getattr(admin_user, "permission_group_id", None):
            group = (
                self.db.query(PermissionGroup)
                .filter(PermissionGroup.id == int(admin_user.permission_group_id))
                .first()
            )
            if group and (group.code or "").strip().upper() not in {"ADM", "ADMIN"}:
                group = None
        if group is None:
            group = (
                self.db.query(PermissionGroup)
                .filter(
                    PermissionGroup.system_group_code == admin_user.system_group_code,
                    PermissionGroup.code.in_(["ADM", "ADMIN"]),
                )
                .order_by(PermissionGroup.code.asc())
                .first()
            )
        if not group:
            raise ValueError("admin 계정의 ADM/ADMIN 권한그룹을 찾을 수 없습니다.")
        return group

    def _ensure_target_company(self, current_user: User) -> Company:
        group_code = (current_user.system_group_code or "").strip()
        if not group_code:
            raise ValueError("사용자의 시스템 그룹 코드가 없습니다.")

        # 재시도/부분실패 시 중복 생성을 막기 위해 기존 자동생성 회사를 우선 재사용
        existing = (
            self.db.query(Company)
            .filter(
                Company.system_group_code == group_code,
                Company.company_code.like("HAAS%"),
            )
            .order_by(Company.created_at.desc())
            .first()
        )
        if existing:
            existing.name_thai = "HAAS"
            existing.name_kor = "HAAS"
            existing.name_eng = "HAAS"
            existing.representative_director_name = "HAAS"
            self.db.flush()
            return existing

        def _build_code(offset_seconds: int = 0) -> str:
            dt = datetime.now() + timedelta(seconds=offset_seconds)
            # HAAS + 년도끝2자리 + 월2자리 + 일2자리 + 분2자리 + 초2자리
            return f"HAAS{dt.strftime('%y%m%d%M%S')}"

        company_code = _build_code()
        # 같은 초 충돌 가능성 대비 짧은 재시도
        for attempt in range(5):
            exists_code = (
                self.db.query(Company.id)
                .filter(
                    Company.system_group_code == group_code,
                    Company.company_code == company_code,
                )
                .first()
            )
            if not exists_code:
                break
            company_code = _build_code(offset_seconds=attempt + 1)

        stmt = (
            pg_insert(Company.__table__)
            .values(
                system_group_code=group_code,
                company_code=company_code,
                name_thai="HAAS",
                name_kor="HAAS",
                name_eng="HAAS",
                representative_director_name="HAAS",
            )
            .on_conflict_do_update(
                index_elements=["system_group_code", "company_code"],
                set_={
                    "name_thai": "HAAS",
                    "name_kor": "HAAS",
                    "name_eng": "HAAS",
                    "representative_director_name": "HAAS",
                },
            )
            .returning(Company.__table__.c.id)
        )
        company_id = self.db.execute(stmt).scalar_one()
        row = self.db.query(Company).filter(Company.id == int(company_id)).first()
        if not row:
            raise ValueError("HAAS 회사 생성/조회에 실패했습니다.")
        return row

    def _create_target_company(self, current_user: User) -> Company:
        group_code = (current_user.system_group_code or "").strip()
        if not group_code:
            raise ValueError("사용자의 시스템 그룹 코드가 없습니다.")

        def _build_code(offset_seconds: int = 0) -> str:
            dt = datetime.now() + timedelta(seconds=offset_seconds)
            return f"HAAS{dt.strftime('%y%m%d%M%S')}"

        company_code = _build_code()
        for attempt in range(5):
            exists_code = (
                self.db.query(Company.id)
                .filter(
                    Company.system_group_code == group_code,
                    Company.company_code == company_code,
                )
                .first()
            )
            if not exists_code:
                break
            company_code = _build_code(offset_seconds=attempt + 1)

        stmt = (
            pg_insert(Company.__table__)
            .values(
                system_group_code=group_code,
                company_code=company_code,
                name_thai="HAAS",
                name_kor="HAAS",
                name_eng="HAAS",
                representative_director_name="HAAS",
            )
            .on_conflict_do_nothing(
                index_elements=["system_group_code", "company_code"],
            )
            .returning(Company.__table__.c.id)
        )
        company_id = self.db.execute(stmt).scalar_one_or_none()
        if company_id is None:
            row = (
                self.db.query(Company)
                .filter(
                    Company.system_group_code == group_code,
                    Company.company_code == company_code,
                )
                .first()
            )
            if not row:
                raise ValueError("대상 회사 생성에 실패했습니다.")
            return row
        row = self.db.query(Company).filter(Company.id == int(company_id)).first()
        if not row:
            raise ValueError("대상 회사 생성/조회에 실패했습니다.")
        return row

    def _get_company_in_scope(self, current_user: User, company_id: int) -> Company:
        row = self.db.query(Company).filter(Company.id == company_id).first()
        if not row:
            raise ValueError("회사를 찾을 수 없습니다.")
        if bool(getattr(current_user, "is_superuser", False)):
            return row
        if (row.system_group_code or "").strip() != (current_user.system_group_code or "").strip():
            raise ValueError("접근 가능한 회사가 아닙니다.")
        return row

    def _ensure_user_company_access(self, user_id: int, company_id: int) -> None:
        exists = (
            self.db.query(UserCompanyAccess.id)
            .filter(
                UserCompanyAccess.user_id == user_id,
                UserCompanyAccess.company_id == company_id,
            )
            .first()
        )
        if not exists:
            self.db.add(UserCompanyAccess(user_id=user_id, company_id=company_id))
            self.db.flush()

    def _copy_major_minor_codes(self, source_company_id: int, target_company_id: int) -> Dict[str, int]:
        major_map: Dict[str, MajorCode] = {}
        copied_major_count = 0
        copied_minor_count = 0
        source_majors = (
            self.db.query(MajorCode)
            .filter(MajorCode.company_id == source_company_id)
            .order_by(MajorCode.id.asc())
            .all()
        )
        for src in source_majors:
            if self._is_excluded_template_code(src.major_code):
                continue
            target = (
                self.db.query(MajorCode)
                .filter(
                    MajorCode.company_id == target_company_id,
                    MajorCode.major_code == src.major_code,
                )
                .first()
            )
            if not target:
                target = MajorCode(
                    company_id=target_company_id,
                    major_code=src.major_code,
                )
                self.db.add(target)
                self.db.flush()
            target.code_definition_type = src.code_definition_type
            target.name_kor = src.name_kor
            target.name_eng = src.name_eng
            target.name_thai = src.name_thai
            target.note = src.note
            major_map[src.major_code] = target
            copied_major_count += 1

        source_minors = (
            self.db.query(MinorCode)
            .filter(MinorCode.company_id == source_company_id)
            .order_by(MinorCode.id.asc())
            .all()
        )
        for src in source_minors:
            if self._is_excluded_template_code(src.minor_code):
                continue
            src_major = self.db.query(MajorCode).filter(MajorCode.id == src.major_code_id).first()
            if not src_major:
                continue
            target_major = major_map.get(src_major.major_code)
            if not target_major:
                continue
            target = (
                self.db.query(MinorCode)
                .filter(
                    MinorCode.company_id == target_company_id,
                    MinorCode.major_code_id == target_major.id,
                    MinorCode.minor_code == src.minor_code,
                )
                .first()
            )
            if not target:
                target = MinorCode(
                    company_id=target_company_id,
                    major_code_id=target_major.id,
                    minor_code=src.minor_code,
                )
                self.db.add(target)
                self.db.flush()
            target.code_definition_type = src.code_definition_type
            target.name_kor = src.name_kor
            target.name_eng = src.name_eng
            target.name_thai = src.name_thai
            target.note = src.note
            copied_minor_count += 1

        return {
            "major_count": copied_major_count,
            "minor_count": copied_minor_count,
        }

    def _copy_employee_reference_items(
        self, source_company_id: int, target_company_id: int
    ) -> Dict[str, int]:
        source_rows = (
            self.db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == source_company_id)
            .order_by(EmployeeReferenceItem.id.asc())
            .all()
        )
        copied_count = 0
        for src in source_rows:
            if self._is_excluded_template_code(src.code):
                continue
            target = (
                self.db.query(EmployeeReferenceItem)
                .filter(
                    EmployeeReferenceItem.company_id == target_company_id,
                    EmployeeReferenceItem.category == src.category,
                    EmployeeReferenceItem.code == src.code,
                )
                .first()
            )
            if not target:
                target = EmployeeReferenceItem(
                    company_id=target_company_id,
                    category=src.category,
                    code=src.code,
                )
                self.db.add(target)
                self.db.flush()
            target.name_kor = src.name_kor
            target.name_eng = src.name_eng
            target.name_thai = src.name_thai
            copied_count += 1
        return {"employee_reference_item_count": copied_count}

    def _copy_attendance_standard(
        self, source_company_id: int, target_company_id: int, admin_user: User
    ) -> Dict[str, int]:
        svc = AttendanceStandardService(self.db)
        source_bundle = svc.get_bundle(source_company_id, admin_user)
        source_bundle["save_scope"] = "all"
        saved = svc.save_bundle(target_company_id, admin_user, source_bundle)

        # 템플릿에 근무달력이 비어 있는 경우를 대비해, 기본 근무달력을 자동 생성합니다.
        if not (saved.get("work_calendars") or []):
            saved = self._ensure_default_work_calendars(
                target_company_id=target_company_id,
                admin_user=admin_user,
                bundle=saved,
            )
        return {"attendance_bundle_copied": 1}

    def _ensure_default_work_calendars(
        self,
        target_company_id: int,
        admin_user: User,
        bundle: Dict[str, Any],
    ) -> Dict[str, Any]:
        svc = AttendanceStandardService(self.db)
        shift_groups = list(bundle.get("shift_group_masters") or [])
        shifts = list(bundle.get("shifts") or [])

        if not shift_groups:
            shift_groups = [
                {
                    "sort_order": 0,
                    "name": "DEFAULT",
                    "description": "Auto-generated default shift group",
                }
            ]
        if not shifts:
            shifts = [
                {
                    "shift_code": "D1",
                    "title": "Default Shift",
                    "start_check_in": "08:00",
                    "start_work": "09:00",
                    "time_out": "18:00",
                    "break_sum": "01:00",
                    "ot_ranges": [],
                }
            ]

        first_group = shift_groups[0]
        first_shift_code = str((shifts[0].get("shift_code") or "D1")).strip() or "D1"
        year = datetime.now().year
        work_calendars = []
        for month in range(1, 13):
            last_day = calendar.monthrange(year, month)[1]
            days = []
            for day in range(1, last_day + 1):
                weekday = datetime(year, month, day).weekday()  # Mon=0 .. Sun=6
                is_workday = weekday < 5
                days.append(
                    {
                        "day_of_month": day,
                        "shift_code": first_shift_code,
                        "is_workday": is_workday,
                    }
                )
            work_calendars.append(
                {
                    "calendar_year": year,
                    "calendar_month": month,
                    "shift_group_name": first_group.get("name") or "DEFAULT",
                    "days": days,
                }
            )

        payload = dict(bundle)
        payload["save_scope"] = "all"
        payload["shift_group_masters"] = shift_groups
        payload["shifts"] = shifts
        payload["work_calendars"] = work_calendars
        payload.pop("deleted_shift_ids", None)
        payload.pop("deleted_shift_group_ids", None)
        payload.pop("deleted_round_section_ids", None)
        payload.pop("deleted_leave_level_ids", None)
        payload.pop("deleted_holiday_ids", None)
        payload.pop("deleted_payment_period_ids", None)
        return svc.save_bundle(target_company_id, admin_user, payload)

    def _copy_system_admin_group(
        self, current_user: User, admin_user: User
    ) -> Dict[str, Any]:
        SystemRbacService(self.db).seed_menus_if_needed()
        template_group = self._get_admin_template_group(admin_user)
        target_group_template_code = (template_group.code or "ADM").strip() or "ADM"
        target_group_code = (current_user.system_group_code or "").strip()
        if not target_group_code:
            raise ValueError("사용자의 시스템 그룹 코드가 없습니다.")

        target_group = (
            self.db.query(PermissionGroup)
            .filter(
                PermissionGroup.system_group_code == target_group_code,
                PermissionGroup.code == target_group_template_code,
            )
            .first()
        )
        if not target_group:
            target_group = PermissionGroup(
                system_group_code=target_group_code,
                code=target_group_template_code,
                name=template_group.name,
                description=template_group.description,
                is_active=True,
            )
            self.db.add(target_group)
            self.db.flush()
        else:
            target_group.name = template_group.name
            target_group.description = template_group.description
            target_group.is_active = True

        menus = self.db.query(AppMenu).order_by(AppMenu.sort_order.asc()).all()
        for menu in menus:
            perm = (
                self.db.query(GroupMenuPermission)
                .filter(
                    GroupMenuPermission.permission_group_id == target_group.id,
                    GroupMenuPermission.app_menu_id == menu.id,
                )
                .first()
            )
            if not perm:
                perm = GroupMenuPermission(
                    permission_group_id=target_group.id,
                    app_menu_id=menu.id,
                )
                self.db.add(perm)
                self.db.flush()
            perm.can_create = True
            perm.can_read = True
            perm.can_update = True
            perm.can_delete = True

        current_user.permission_group_id = target_group.id
        current_user.can_manage_system = True
        self.db.flush()
        return {
            "permission_group_id": target_group.id,
            "permission_group_code": target_group.code,
            "menu_permission_count": len(menus),
        }

    def run_setup(self, current_user: User, options: Dict[str, bool]) -> Dict[str, Any]:
        self._ensure_company_code_index_compat()
        template_company = self._get_template_company()
        admin_user = self._get_admin_user()
        target_company = self._ensure_target_company(current_user)
        self._ensure_user_company_access(current_user.id, target_company.id)

        result: Dict[str, Any] = {
            "company_id": target_company.id,
            "company_code": target_company.company_code,
            "system_group_code": target_company.system_group_code,
        }
        if options.get("major_minor_codes"):
            result.update(
                self._copy_major_minor_codes(template_company.id, target_company.id)
            )
        if options.get("hr_reference"):
            result.update(
                self._copy_employee_reference_items(template_company.id, target_company.id)
            )
        if options.get("attendance_reference"):
            result.update(
                self._copy_attendance_standard(
                    template_company.id, target_company.id, admin_user
                )
            )
        if options.get("system_rbac"):
            result.update(self._copy_system_admin_group(current_user, admin_user))

        self.db.commit()
        return result

    def run_template_generation(
        self,
        current_user: User,
        *,
        source_company_id: int,
        options: Dict[str, bool],
        target_company_id: int | None = None,
        create_new_company: bool = False,
    ) -> Dict[str, Any]:
        self._ensure_company_code_index_compat()
        admin_user = self._get_admin_user()
        source_company = self._get_company_in_scope(current_user, source_company_id)

        if create_new_company:
            target_company = self._create_target_company(current_user)
        else:
            if not target_company_id:
                raise ValueError("대상 회사를 선택해주세요.")
            target_company = self._get_company_in_scope(current_user, target_company_id)

        self._ensure_user_company_access(current_user.id, target_company.id)

        result: Dict[str, Any] = {
            "source_company_id": source_company.id,
            "source_company_code": source_company.company_code,
            "company_id": target_company.id,
            "company_code": target_company.company_code,
            "system_group_code": target_company.system_group_code,
        }
        if options.get("major_minor_codes"):
            result.update(
                self._copy_major_minor_codes(source_company.id, target_company.id)
            )
        if options.get("hr_reference"):
            result.update(
                self._copy_employee_reference_items(source_company.id, target_company.id)
            )
        if options.get("attendance_reference"):
            result.update(
                self._copy_attendance_standard(source_company.id, target_company.id, admin_user)
            )
        if options.get("system_rbac"):
            result.update(self._copy_system_admin_group(current_user, admin_user))

        self.db.commit()
        return result
