"""직원 어학정보 CRUD"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_language import EmployeeLanguage


class EmployeeLanguageService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def list_by_employee(self, employee_id: int) -> List[EmployeeLanguage]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeeLanguage)
            .filter(EmployeeLanguage.employee_id == employee_id)
            .order_by(EmployeeLanguage.sort_order.asc(), EmployeeLanguage.id.asc())
            .all()
        )

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
    ) -> List[EmployeeLanguage]:
        """어학정보조회 등: 직원별 어학 API를 반복 호출하지 않도록 일괄 조회."""
        if not allowed_company_ids:
            return []
        q = (
            self.db.query(EmployeeLanguage)
            .join(Employee, Employee.id == EmployeeLanguage.employee_id)
            .filter(Employee.company_id.in_(allowed_company_ids))
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        return (
            q.order_by(
                EmployeeLanguage.employee_id.asc(),
                EmployeeLanguage.sort_order.asc(),
                EmployeeLanguage.id.asc(),
            ).all()
        )

    def create(self, employee_id: int, data: Dict[str, Any]) -> EmployeeLanguage:
        self._get_employee_or_raise(employee_id)
        rows = (
            self.db.query(EmployeeLanguage)
            .filter(EmployeeLanguage.employee_id == employee_id)
            .order_by(EmployeeLanguage.sort_order.asc())
            .all()
        )
        for r in rows:
            r.sort_order = r.sort_order + 1
        row = EmployeeLanguage(employee_id=employee_id, sort_order=0, **data)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, employee_id: int, language_id: int, data: Dict[str, Any]) -> EmployeeLanguage:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeeLanguage)
            .filter(
                EmployeeLanguage.id == language_id,
                EmployeeLanguage.employee_id == employee_id,
            )
            .first()
        )
        if not row:
            raise ValueError("어학정보를 찾을 수 없습니다.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_id: int, language_id: int) -> None:
        row = (
            self.db.query(EmployeeLanguage)
            .filter(
                EmployeeLanguage.id == language_id,
                EmployeeLanguage.employee_id == employee_id,
            )
            .first()
        )
        if not row:
            raise ValueError("어학정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

    def bulk_save(self, employee_id: int, data: Dict[str, Any]) -> List[EmployeeLanguage]:
        self._get_employee_or_raise(employee_id)
        incoming_rows = data.get("rows") or []
        existing = (
            self.db.query(EmployeeLanguage)
            .filter(EmployeeLanguage.employee_id == employee_id)
            .all()
        )
        existing_by_id = {r.id: r for r in existing}

        kept_ids: set[int] = set()
        for idx, item in enumerate(incoming_rows):
            row_id = item.get("id")
            row = existing_by_id.get(row_id) if isinstance(row_id, int) else None
            if row is None:
                row = EmployeeLanguage(employee_id=employee_id)
                self.db.add(row)
            row.sort_order = idx
            for key in [
                "acquisition_date",
                "language_code",
                "test_type",
                "score",
                "grade",
                "expiry_date",
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
