"""회사별 인사기준정보 공통 서비스"""

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee_reference_item import EmployeeReferenceItem


class EmployeeReferenceItemService:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        *,
        company_id: int,
        category: str,
    ) -> List[EmployeeReferenceItem]:
        return (
            self.db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .filter(EmployeeReferenceItem.category == category)
            .order_by(EmployeeReferenceItem.code.asc())
            .all()
        )

    def list_all_for_company(self, company_id: int) -> List[EmployeeReferenceItem]:
        """회사 단위 인사기준정보 전체(카테고리 무관) — 조회 화면에서 HTTP 왕복 횟수 축소용."""
        return (
            self.db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .order_by(
                EmployeeReferenceItem.category.asc(),
                EmployeeReferenceItem.code.asc(),
            )
            .all()
        )

    def get(self, *, company_id: int, category: str, item_id: int) -> Optional[EmployeeReferenceItem]:
        return (
            self.db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .filter(EmployeeReferenceItem.category == category)
            .filter(EmployeeReferenceItem.id == item_id)
            .first()
        )

    def create(self, data: Dict[str, Any]) -> EmployeeReferenceItem:
        # code/카테고리/회사 등은 그대로 저장
        row = EmployeeReferenceItem(**data)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(
        self,
        *,
        company_id: int,
        category: str,
        item_id: int,
        data: Dict[str, Any],
    ) -> EmployeeReferenceItem:
        row = self.get(company_id=company_id, category=category, item_id=item_id)
        if not row:
            raise ValueError("기준정보를 찾을 수 없습니다.")
        for k, v in data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, *, company_id: int, category: str, item_id: int) -> None:
        row = self.get(company_id=company_id, category=category, item_id=item_id)
        if not row:
            raise ValueError("기준정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

