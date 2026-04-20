"""직원 개인정보 CRUD (직원당 1행)"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_personal_info import EmployeePersonalInfo


class EmployeePersonalInfoService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def get_by_employee(self, employee_id: int) -> Optional[EmployeePersonalInfo]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeePersonalInfo)
            .filter(EmployeePersonalInfo.employee_id == employee_id)
            .first()
        )

    def create(self, employee_id: int, data: Dict[str, Any]) -> EmployeePersonalInfo:
        self._get_employee_or_raise(employee_id)
        if self.get_by_employee(employee_id):
            raise ValueError("이미 개인정보가 등록되어 있습니다. 수정을 이용하세요.")
        row = EmployeePersonalInfo(employee_id=employee_id, **data)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, employee_id: int, data: Dict[str, Any]) -> EmployeePersonalInfo:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeePersonalInfo)
            .filter(EmployeePersonalInfo.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("개인정보를 찾을 수 없습니다. 먼저 등록하세요.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_id: int) -> None:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeePersonalInfo)
            .filter(EmployeePersonalInfo.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("개인정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
    ) -> List[EmployeePersonalInfo]:
        """접근 가능한 회사 범위의 직원 개인정보를 한 번에 조회 (목록 화면 N+1 방지)."""
        if not allowed_company_ids:
            return []
        q = (
            self.db.query(EmployeePersonalInfo)
            .join(Employee, Employee.id == EmployeePersonalInfo.employee_id)
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        else:
            q = q.filter(Employee.company_id.in_(allowed_company_ids))
        return q.all()

