"""시스템 RBAC / 사용자 관리 서비스"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple

from app.models.user import User
from app.models.company import Company
from app.models.user_company_access import UserCompanyAccess
from app.models.rbac import PermissionGroup, AppMenu, GroupMenuPermission
from app.services.auth import AuthService
from app.core.user_privilege import user_has_unrestricted_app_menus


# (menu_key, label_key, sort_order)
# Sidebar 구조와 동일하게 유지한다.
DEFAULT_APP_MENUS: Tuple[Tuple[str, str, int], ...] = (
    ("dashboard", "menu.dashboard", 10),
    ("chat", "header.aiAssistant", 11),
    ("recruitment", "menu.recruitment", 20),
    ("recruitment-request", "recruitment.request", 21),
    ("recruitment-approval", "recruitment.approval", 22),
    ("recruitment-publish", "recruitment.publish", 23),
    ("recruitment-applications", "recruitment.applications", 24),
    ("recruitment-application-list", "recruitment.applicationList", 25),
    ("recruitment-screening", "recruitment.screening", 26),
    ("recruitment-interview", "recruitment.interview", 27),
    ("recruitment-offer", "recruitment.offer", 28),
    ("recruitment-signature", "recruitment.signature", 29),
    ("employees", "menu.employees", 30),
    ("hr-master-manage", "menu.hrMasterManage", 31),
    ("hr-master-inquiry", "menu.hrMasterInquiry", 32),
    ("career-inquiry", "menu.careerInquiry", 33),
    ("dependent-inquiry", "menu.dependentInquiry", 34),
    ("education-inquiry", "menu.educationInquiry", 35),
    ("hr-master-certification-inquiry", "menu.hrMasterCertificationInquiry", 36),
    ("hr-master-family-inquiry", "menu.familyInquiry", 37),
    ("hr-master-address-inquiry", "menu.hrMasterAddressInquiry", 38),
    ("hr-master-language-inquiry", "menu.hrMasterLanguageInquiry", 39),
    ("hr-personnel-record-card", "menu.personnelRecordCard", 40),
    ("hr-personnel-record-card-history", "menu.personnelRecordCardHistory", 41),
    ("hr-master-report", "menu.hrMasterReport", 42),
    ("hr-master-reference-manage", "menu.hrMasterReferenceManage", 43),
    ("attendance", "menu.attendance", 50),
    ("attendance-master-manage", "menu.attendanceMasterManage", 51),
    ("attendance-annual-manage", "menu.attendanceAnnualManage", 52),
    ("attendance-leave-manage", "menu.attendanceLeaveManage", 53),
    ("attendance-leave-status", "menu.attendanceLeaveStatus", 54),
    ("attendance-inquiry", "menu.attendanceInquiry", 55),
    ("attendance-additional-ot-manage", "menu.attendanceAdditionalOtManage", 56),
    ("attendance-overview", "menu.attendanceOverview", 57),
    ("attendance-report", "menu.attendanceReport", 58),
    ("attendance-aggregate", "menu.attendanceAggregate", 59),
    ("attendance-status-inquiry", "menu.attendanceStatusInquiry", 60),
    ("attendance-allowance-status-inquiry", "menu.attendanceAllowanceStatusInquiry", 61),
    ("attendance-ot-allowance-report", "menu.attendanceOtAllowanceReport", 62),
    ("attendance-payroll-bucket-aggregate", "menu.attendancePayrollBucketAggregate", 63),
    ("attendance-payroll-bucket-status", "menu.attendancePayrollBucketStatus", 64),
    ("attendance-payroll-bucket-status-period", "menu.attendancePayrollBucketStatusPeriod", 65),
    ("attendance-work-calendar-manage", "menu.attendanceWorkCalendarManage", 66),
    ("attendance-standard-manage", "menu.attendanceStandardManage", 67),
    ("payroll", "menu.payroll", 68),
    ("tax", "menu.tax", 80),
    ("master-data", "menu.masterData", 90),
    ("tax-company-manage", "menu.companyManage", 91),
    ("master-major-code-manage", "menu.majorCodeManage", 92),
    ("master-minor-code-manage", "menu.minorCodeManage", 93),
    ("system", "menu.system", 200),
    ("system-users", "menu.systemUsers", 201),
    ("system-user-companies", "menu.systemUserCompanies", 202),
    ("system-role-groups", "menu.systemRoleGroups", 203),
    ("system-role-group-menus", "menu.systemRoleGroupMenus", 204),
    ("system-template-generation", "menu.systemTemplateGeneration", 205),
    ("system-schedule-manage", "menu.scheduleManage", 206),
)

# RBAC 매트릭스에서 제외(기존 DB 행은 seed 시 삭제). 탭 권한은 TAB_PERMISSION_ALIAS 로 위임.
REMOVED_APP_MENU_KEYS: Tuple[str, ...] = ("payslip", "reports")


class SystemRbacService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _normalize_group_code(group_code: Optional[str]) -> Optional[str]:
        if group_code is None:
            return None
        v = str(group_code).strip()
        return v or None

    @staticmethod
    def _is_superadmin(user: User) -> bool:
        return bool(getattr(user, "is_superuser", False))

    def _current_user_group_code(self, current_user: User) -> str:
        code = self._normalize_group_code(getattr(current_user, "system_group_code", None))
        if not code:
            raise ValueError("로그인 사용자의 시스템 그룹 코드가 없습니다.")
        return code

    def _resolve_target_group_code(
        self, current_user: User, requested_group_code: Optional[str] = None
    ) -> str:
        current_group_code = self._current_user_group_code(current_user)
        if not self._is_superadmin(current_user):
            return current_group_code
        normalized = self._normalize_group_code(requested_group_code)
        return normalized or current_group_code

    def _scoped_user(self, user_id: int, current_user: User) -> Optional[User]:
        q = self.db.query(User).filter(User.id == user_id)
        if not self._is_superadmin(current_user):
            q = q.filter(User.system_group_code == self._current_user_group_code(current_user))
        return q.first()

    def _scoped_group(self, group_id: int, current_user: User) -> Optional[PermissionGroup]:
        q = self.db.query(PermissionGroup).filter(PermissionGroup.id == group_id)
        if not self._is_superadmin(current_user):
            q = q.filter(PermissionGroup.system_group_code == self._current_user_group_code(current_user))
        return q.first()

    def seed_menus_if_needed(self) -> int:
        """없는 menu_key는 삽입하고, 기존 행은 label_key·sort_order를 목록과 동기화. 추가된 행 수 반환."""
        added = 0
        dirty = False
        desired_keys = {menu_key for menu_key, _, _ in DEFAULT_APP_MENUS}
        for row_rm in self.db.query(AppMenu).all():
            if row_rm.menu_key in desired_keys:
                continue
            # legacy/미사용 메뉴는 매트릭스에서 정리한다.
            self.db.delete(row_rm)
            dirty = True
        for mk in REMOVED_APP_MENU_KEYS:
            row_rm = self.db.query(AppMenu).filter(AppMenu.menu_key == mk).first()
            if row_rm:
                self.db.delete(row_rm)
                dirty = True
        for menu_key, label_key, sort_order in DEFAULT_APP_MENUS:
            row = (
                self.db.query(AppMenu).filter(AppMenu.menu_key == menu_key).first()
            )
            if not row:
                m = AppMenu(
                    menu_key=menu_key, label_key=label_key, sort_order=sort_order
                )
                self.db.add(m)
                self.db.flush()
                added += 1
                dirty = True
                for g in self.db.query(PermissionGroup).all():
                    self.db.add(
                        GroupMenuPermission(
                            permission_group_id=g.id,
                            app_menu_id=m.id,
                            can_create=False,
                            can_read=False,
                            can_update=False,
                            can_delete=False,
                        )
                    )
                continue
            if row.label_key != label_key:
                row.label_key = label_key
                dirty = True
            if row.sort_order != sort_order:
                row.sort_order = sort_order
                dirty = True
        if dirty:
            self.db.commit()
        return added

    def _sync_permissions_for_all_groups(self, menu: AppMenu) -> None:
        for g in self.db.query(PermissionGroup).all():
            exists = (
                self.db.query(GroupMenuPermission)
                .filter(
                    GroupMenuPermission.permission_group_id == g.id,
                    GroupMenuPermission.app_menu_id == menu.id,
                )
                .first()
            )
            if not exists:
                self.db.add(
                    GroupMenuPermission(
                        permission_group_id=g.id,
                        app_menu_id=menu.id,
                        can_create=False,
                        can_read=False,
                        can_update=False,
                        can_delete=False,
                    )
                )

    def list_menus(self) -> List[AppMenu]:
        self.seed_menus_if_needed()
        return (
            self.db.query(AppMenu).order_by(AppMenu.sort_order.asc()).all()
        )

    # —— 권한 그룹 ——
    def list_groups(self, current_user: User) -> List[PermissionGroup]:
        q = self.db.query(PermissionGroup)
        if not self._is_superadmin(current_user):
            q = q.filter(PermissionGroup.system_group_code == self._current_user_group_code(current_user))
        return q.order_by(PermissionGroup.code.asc()).all()

    def create_group(self, data: Dict[str, Any], current_user: User) -> PermissionGroup:
        code = (data.get("code") or "").strip()
        if not code:
            raise ValueError("그룹 코드는 필수입니다.")
        name = (data.get("name") or "").strip()
        if not name:
            raise ValueError("그룹명은 필수입니다.")
        g = PermissionGroup(
            system_group_code=self._resolve_target_group_code(
                current_user, data.get("system_group_code")
            ),
            code=code,
            name=name,
            description=data.get("description"),
            is_active=bool(data.get("is_active", True)),
        )
        self.db.add(g)
        self.db.commit()
        self.db.refresh(g)
        self.seed_menus_if_needed()
        for m in self.db.query(AppMenu).all():
            self.db.add(
                GroupMenuPermission(
                    permission_group_id=g.id,
                    app_menu_id=m.id,
                    can_create=False,
                    can_read=False,
                    can_update=False,
                    can_delete=False,
                )
            )
        self.db.commit()
        self.db.refresh(g)
        return g

    def update_group(self, group_id: int, data: Dict[str, Any], current_user: User) -> PermissionGroup:
        g = self._scoped_group(group_id, current_user)
        if not g:
            raise ValueError("권한 그룹을 찾을 수 없습니다.")
        for k in ("name", "description", "is_active"):
            if k in data and data[k] is not None:
                setattr(g, k, data[k])
        self.db.commit()
        self.db.refresh(g)
        return g

    def delete_group(self, group_id: int, current_user: User) -> None:
        g = self._scoped_group(group_id, current_user)
        if not g:
            raise ValueError("권한 그룹을 찾을 수 없습니다.")
        if (
            self.db.query(User)
            .filter(User.permission_group_id == group_id)
            .filter(User.system_group_code == g.system_group_code)
            .first()
        ):
            raise ValueError("이 그룹에 할당된 사용자가 있어 삭제할 수 없습니다.")
        self.db.delete(g)
        self.db.commit()

    def get_group_menu_matrix(self, group_id: int, current_user: User) -> List[Dict[str, Any]]:
        self.seed_menus_if_needed()
        g = self._scoped_group(group_id, current_user)
        if not g:
            raise ValueError("권한 그룹을 찾을 수 없습니다.")
        rows = []
        menus = self.db.query(AppMenu).order_by(AppMenu.sort_order.asc()).all()
        for m in menus:
            perm = (
                self.db.query(GroupMenuPermission)
                .filter(
                    GroupMenuPermission.permission_group_id == group_id,
                    GroupMenuPermission.app_menu_id == m.id,
                )
                .first()
            )
            if not perm:
                perm = GroupMenuPermission(
                    permission_group_id=group_id,
                    app_menu_id=m.id,
                    can_create=False,
                    can_read=False,
                    can_update=False,
                    can_delete=False,
                )
                self.db.add(perm)
                self.db.commit()
                self.db.refresh(perm)
            rows.append(
                {
                    "menu_id": m.id,
                    "menu_key": m.menu_key,
                    "label_key": m.label_key,
                    "can_create": perm.can_create,
                    "can_read": perm.can_read,
                    "can_update": perm.can_update,
                    "can_delete": perm.can_delete,
                }
            )
        return rows

    def put_group_menu_matrix(self, group_id: int, items: List[Dict[str, Any]], current_user: User) -> None:
        g = self._scoped_group(group_id, current_user)
        if not g:
            raise ValueError("권한 그룹을 찾을 수 없습니다.")
        for it in items:
            mid = it["menu_id"]
            perm = (
                self.db.query(GroupMenuPermission)
                .filter(
                    GroupMenuPermission.permission_group_id == group_id,
                    GroupMenuPermission.app_menu_id == mid,
                )
                .first()
            )
            if not perm:
                perm = GroupMenuPermission(
                    permission_group_id=group_id, app_menu_id=mid
                )
                self.db.add(perm)
            perm.can_create = bool(it.get("can_create"))
            perm.can_read = bool(it.get("can_read"))
            perm.can_update = bool(it.get("can_update"))
            perm.can_delete = bool(it.get("can_delete"))
        self.db.commit()

    def get_effective_menu_permissions_for_user(self, user: User) -> List[Dict[str, Any]]:
        """로그인 사용자에게 적용할 메뉴별 CRUD (권한 그룹 매트릭스)."""
        self.seed_menus_if_needed()
        if user_has_unrestricted_app_menus(user):
            menus = self.db.query(AppMenu).order_by(AppMenu.sort_order.asc()).all()
            return [
                {
                    "menu_id": m.id,
                    "menu_key": m.menu_key,
                    "label_key": m.label_key,
                    "can_create": True,
                    "can_read": True,
                    "can_update": True,
                    "can_delete": True,
                }
                for m in menus
            ]
        gid = getattr(user, "permission_group_id", None)
        if gid is None:
            # 그룹 미배정: 기존·회원가입 계정 호환 — 제한 없음 (관리자가 그룹 지정 시 매트릭스 적용)
            menus = self.db.query(AppMenu).order_by(AppMenu.sort_order.asc()).all()
            return [
                {
                    "menu_id": m.id,
                    "menu_key": m.menu_key,
                    "label_key": m.label_key,
                    "can_create": True,
                    "can_read": True,
                    "can_update": True,
                    "can_delete": True,
                }
                for m in menus
            ]
        return self.get_group_menu_matrix(gid, current_user=user)

    # —— 사용자 ——
    def list_users(
        self, current_user: User, company_id: Optional[int] = None
    ) -> List[User]:
        q = self.db.query(User)
        if not self._is_superadmin(current_user):
            q = q.filter(User.system_group_code == self._current_user_group_code(current_user))
        if company_id is not None:
            q = q.join(UserCompanyAccess, UserCompanyAccess.user_id == User.id).filter(
                UserCompanyAccess.company_id == int(company_id)
            )
        return q.order_by(User.id.asc()).all()

    def create_user(self, data: Dict[str, Any], current_user: User) -> User:
        target_group_code = self._resolve_target_group_code(
            current_user, data.get("system_group_code")
        )
        permission_group_id = data.get("permission_group_id")
        if permission_group_id is not None:
            q = (
                self.db.query(PermissionGroup)
                .filter(PermissionGroup.id == permission_group_id)
                .filter(PermissionGroup.system_group_code == target_group_code)
            )
            if not q.first():
                raise ValueError("선택한 권한그룹을 찾을 수 없습니다.")
        auth = AuthService()
        u = auth.register_user(
            db=self.db,
            email=data["email"],
            username=data["username"],
            password=data["password"],
            full_name=data.get("full_name"),
            system_group_code=target_group_code,
        )
        u.role = data.get("role") or "user"
        u.can_manage_system = bool(data.get("can_manage_system", False))
        if permission_group_id is not None:
            u.permission_group_id = permission_group_id
        self.db.commit()
        self.db.refresh(u)
        return u

    def update_user(self, user_id: int, data: Dict[str, Any], current_user: User) -> User:
        actor = self.db.query(User).filter(User.id == current_user.id).first()
        if not actor:
            raise ValueError("로그인 사용자를 찾을 수 없습니다.")
        u = self._scoped_user(user_id, actor)
        if not u:
            raise ValueError("사용자를 찾을 수 없습니다.")
        if "permission_group_id" in data:
            pgid = data["permission_group_id"]
            if pgid is not None:
                pg = (
                    self.db.query(PermissionGroup)
                    .filter(PermissionGroup.id == pgid)
                    .filter(PermissionGroup.system_group_code == u.system_group_code)
                    .first()
                )
                if not pg:
                    raise ValueError("선택한 권한그룹을 찾을 수 없습니다.")
        if "full_name" in data:
            u.full_name = data["full_name"]
        if "role" in data and data["role"] is not None:
            u.role = data["role"]
        if "is_active" in data and data["is_active"] is not None:
            u.is_active = data["is_active"]
        if "permission_group_id" in data:
            u.permission_group_id = data["permission_group_id"]
        if data.get("password"):
            u.hashed_password = AuthService.get_password_hash(data["password"])
        if "can_manage_system" in data and data["can_manage_system"] is not None:
            u.can_manage_system = bool(data["can_manage_system"])
        if "is_superuser" in data and data["is_superuser"] is not None:
            if not self._is_superadmin(actor):
                raise ValueError("슈퍼유저 지정은 슈퍼유저만 변경할 수 있습니다.")
            new_sup = bool(data["is_superuser"])
            if u.id == actor.id and not new_sup:
                raise ValueError(
                    "본인의 슈퍼유저 권한은 해제할 수 없습니다. 다른 슈퍼유저에게 요청하세요."
                )
            u.is_superuser = new_sup
        self.db.commit()
        self.db.refresh(u)
        return u

    def get_user_company_ids(self, user_id: int, current_user: User) -> List[int]:
        u = self._scoped_user(user_id, current_user)
        if not u:
            raise ValueError("사용자를 찾을 수 없습니다.")
        rows = (
            self.db.query(UserCompanyAccess.company_id)
            .filter(UserCompanyAccess.user_id == user_id)
            .all()
        )
        return [r[0] for r in rows]

    def set_user_companies(self, user_id: int, company_ids: List[int], current_user: User) -> None:
        # 동일 DB 처리 세션에서 재조회해 플래그·그룹이 항상 저장소 기준이 되도록 함
        # (미들웨어/테스트 등에서 다른 세션의 User가 넘어오는 경우 대비)
        actor = self.db.query(User).filter(User.id == current_user.id).first()
        if not actor:
            raise ValueError("로그인 사용자를 찾을 수 없습니다.")
        u = self._scoped_user(user_id, actor)
        if not u:
            raise ValueError("사용자를 찾을 수 없습니다.")
        ids = sorted({int(x) for x in company_ids})
        user_group = (u.system_group_code or "").strip()
        skip_group_check = self._is_superadmin(actor)
        for cid in ids:
            c = self.db.query(Company).filter(Company.id == cid).first()
            if not c:
                raise ValueError(f"회사 ID {cid}를 찾을 수 없습니다.")
            if not skip_group_check and (c.system_group_code or "").strip() != user_group:
                raise ValueError(
                    f"회사 '{c.company_code}'(ID {cid})는 이 사용자의 시스템 그룹({user_group})과 "
                    f"다릅니다. 동일 그룹의 회사만 지정할 수 있습니다."
                )
        self.db.query(UserCompanyAccess).filter(
            UserCompanyAccess.user_id == user_id
        ).delete(synchronize_session=False)
        for cid in ids:
            self.db.add(UserCompanyAccess(user_id=user_id, company_id=cid))
        self.db.commit()

    def deactivate_user(self, user_id: int, current_user: User) -> None:
        u = self._scoped_user(user_id, current_user)
        if not u:
            raise ValueError("사용자를 찾을 수 없습니다.")
        u.is_active = False
        self.db.commit()
