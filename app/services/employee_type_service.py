"""회사별 급여형태(EMPLOYEE TYPE) 기준정보 서비스"""
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from app.models.employee_type import EmployeeType


class EmployeeTypeService:
    def __init__(self, db: Session):
        self.db = db

    def list(self, company_id: Optional[int] = None) -> List[EmployeeType]:
        q = self.db.query(EmployeeType).order_by(EmployeeType.employee_type_code.asc())
        if company_id is not None:
            q = q.filter(EmployeeType.company_id == company_id)
        return q.all()

    def get(self, employee_type_id: int) -> Optional[EmployeeType]:
        return self.db.query(EmployeeType).filter(EmployeeType.id == employee_type_id).first()

    def create(self, data: Dict[str, Any]) -> EmployeeType:
        code = (data.get("employee_type_code") or "").strip()
        if not code:
            raise ValueError("급여형태 코드는 필수입니다.")
        row = EmployeeType(**{**data, "employee_type_code": code})
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, employee_type_id: int, data: Dict[str, Any]) -> EmployeeType:
        row = self.get(employee_type_id)
        if not row:
            raise ValueError("급여형태를 찾을 수 없습니다.")
        for k, v in data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_type_id: int) -> None:
        row = self.get(employee_type_id)
        if not row:
            raise ValueError("급여형태를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

