"""직원 경력사항 CRUD"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_career import EmployeeCareer


class EmployeeCareerService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def list_by_employee(self, employee_id: int) -> List[EmployeeCareer]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeeCareer)
            .filter(EmployeeCareer.employee_id == employee_id)
            .order_by(EmployeeCareer.sort_order.asc(), EmployeeCareer.id.asc())
            .all()
        )

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
    ) -> List[EmployeeCareer]:
        """경력조회 등: 직원별 경력 API를 반복 호출하지 않도록 일괄 조회."""
        if not allowed_company_ids:
            return []
        q = (
            self.db.query(EmployeeCareer)
            .join(Employee, Employee.id == EmployeeCareer.employee_id)
            .filter(Employee.company_id.in_(allowed_company_ids))
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        return (
            q.order_by(
                EmployeeCareer.employee_id.asc(),
                EmployeeCareer.sort_order.asc(),
                EmployeeCareer.id.asc(),
            ).all()
        )

    def create(self, employee_id: int, data: Dict[str, Any]) -> EmployeeCareer:
        self._get_employee_or_raise(employee_id)
        rows = (
            self.db.query(EmployeeCareer)
            .filter(EmployeeCareer.employee_id == employee_id)
            .order_by(EmployeeCareer.sort_order.asc())
            .all()
        )
        for r in rows:
            r.sort_order = r.sort_order + 1
        row = EmployeeCareer(employee_id=employee_id, sort_order=0, **data)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, employee_id: int, career_id: int, data: Dict[str, Any]) -> EmployeeCareer:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeeCareer)
            .filter(EmployeeCareer.id == career_id, EmployeeCareer.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("경력사항 정보를 찾을 수 없습니다.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_id: int, career_id: int) -> None:
        row = (
            self.db.query(EmployeeCareer)
            .filter(EmployeeCareer.id == career_id, EmployeeCareer.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("경력사항 정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

    def bulk_save(self, employee_id: int, data: Dict[str, Any]) -> List[EmployeeCareer]:
        self._get_employee_or_raise(employee_id)
        incoming_rows = data.get("rows") or []
        existing = (
            self.db.query(EmployeeCareer)
            .filter(EmployeeCareer.employee_id == employee_id)
            .all()
        )
        existing_by_id = {r.id: r for r in existing}

        kept_ids: set[int] = set()
        for idx, item in enumerate(incoming_rows):
            row_id = item.get("id")
            row = existing_by_id.get(row_id) if isinstance(row_id, int) else None
            if row is None:
                row = EmployeeCareer(employee_id=employee_id)
                self.db.add(row)
            row.sort_order = idx
            for key in [
                "position_title",
                "work_details",
                "enter_date",
                "resigned_date",
                "company_name",
                "address",
                "telephone",
                "begin_salary",
                "resignation_reason",
                "latest_salary",
                "tenure_text",
            ]:
                if key in item:
                    setattr(row, key, item.get(key))
            if row.id is not None:
                kept_ids.add(row.id)

        self.db.flush()
        for r in existing:
            if r.id not in kept_ids and all(
                not (isinstance(i.get("id"), int) and i.get("id") == r.id)
                for i in incoming_rows
            ):
                self.db.delete(r)

        self.db.commit()
        return self.list_by_employee(employee_id)
