"""회사 마스터 서비스"""
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from app.models.company import Company
from app.models.employee import Employee
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.user import User


class CompanyService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _is_superadmin(user: User) -> bool:
        return bool(getattr(user, "is_superuser", False))

    @staticmethod
    def _group_code(user: User) -> str:
        code = (getattr(user, "system_group_code", None) or "").strip()
        if not code:
            raise ValueError("로그인 사용자의 시스템 그룹 코드가 없습니다.")
        return code

    def list_companies(self, current_user: User) -> List[Company]:
        q = self.db.query(Company)
        if not self._is_superadmin(current_user):
            q = q.filter(Company.system_group_code == self._group_code(current_user))
        return q.order_by(Company.company_code.asc()).all()

    def get(self, company_id: int, current_user: User) -> Optional[Company]:
        q = self.db.query(Company).filter(Company.id == company_id)
        if not self._is_superadmin(current_user):
            q = q.filter(Company.system_group_code == self._group_code(current_user))
        return q.first()

    def create(self, data: Dict[str, Any], current_user: User) -> Company:
        code = (data.get("company_code") or "").strip()
        if not code:
            raise ValueError("회사 코드는 필수입니다.")
        target_group_code = self._group_code(current_user)
        if self._is_superadmin(current_user):
            target_group_code = (
                str(data.get("system_group_code")).strip()
                if data.get("system_group_code")
                else target_group_code
            )
        if not target_group_code:
            raise ValueError("시스템 그룹 코드를 확인할 수 없습니다.")
        dup = (
            self.db.query(Company.id)
            .filter(
                Company.system_group_code == target_group_code,
                Company.company_code == code,
            )
            .first()
        )
        if dup:
            raise ValueError("동일 시스템 그룹 내에 이미 같은 회사 코드가 있습니다.")
        row = Company(
            **{**data, "company_code": code, "system_group_code": target_group_code}
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, company_id: int, data: Dict[str, Any], current_user: User) -> Company:
        row = self.get(company_id, current_user=current_user)
        if not row:
            raise ValueError("회사를 찾을 수 없습니다.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, company_id: int, current_user: User) -> None:
        row = self.get(company_id, current_user=current_user)
        if not row:
            raise ValueError("회사를 찾을 수 없습니다.")

        if (
            self.db.query(Employee.id)
            .filter(Employee.company_id == company_id)
            .first()
        ):
            raise ValueError(
                "해당 회사에 소속된 직원이 있어 회사를 삭제할 수 없습니다. "
                "먼저 직원의 회사를 변경하거나 퇴사 처리하세요."
            )

        ref_ids = [
            rid
            for (rid,) in self.db.query(EmployeeReferenceItem.id)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .all()
        ]
        if ref_ids:
            item_filters = or_(
                Employee.department_item_id.in_(ref_ids),
                Employee.job_level_item_id.in_(ref_ids),
                Employee.position_item_id.in_(ref_ids),
                Employee.employment_type_item_id.in_(ref_ids),
                Employee.salary_process_type_item_id.in_(ref_ids),
                Employee.division_item_id.in_(ref_ids),
                Employee.work_place_item_id.in_(ref_ids),
                Employee.area_item_id.in_(ref_ids),
                Employee.work_status_item_id.in_(ref_ids),
                Employee.employee_level_item_id.in_(ref_ids),
            )
            if self.db.query(Employee.id).filter(item_filters).first():
                raise ValueError(
                    "직원이 해당 회사의 인사기준정보를 참조 중이라 회사를 삭제할 수 없습니다. "
                    "직원 인사정보에서 해당 항목을 해제한 뒤 다시 시도하세요."
                )

        self.db.delete(row)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ValueError(
                "해당 회사 또는 연결된 데이터가 다른 테이블에서 참조 중이라 삭제할 수 없습니다."
            ) from None
