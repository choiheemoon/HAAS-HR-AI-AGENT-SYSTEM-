"""회사별 Minor 코드 기준정보 서비스"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.minor_code import MinorCode


class MinorCodeService:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self, company_id: Optional[int] = None, major_code_id: Optional[int] = None
    ) -> List[MinorCode]:
        q = self.db.query(MinorCode).order_by(MinorCode.minor_code.asc())
        if company_id is not None:
            q = q.filter(MinorCode.company_id == company_id)
        if major_code_id is not None:
            q = q.filter(MinorCode.major_code_id == major_code_id)
        return q.all()

    def get(self, minor_code_id: int) -> Optional[MinorCode]:
        return self.db.query(MinorCode).filter(MinorCode.id == minor_code_id).first()

    def create(self, data: Dict[str, Any]) -> MinorCode:
        code = (data.get("minor_code") or "").strip()
        if not code:
            raise ValueError("Minor 코드는 필수입니다.")
        row = MinorCode(**{**data, "minor_code": code})
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, minor_code_id: int, data: Dict[str, Any]) -> MinorCode:
        row = self.get(minor_code_id)
        if not row:
            raise ValueError("Minor 코드를 찾을 수 없습니다.")
        # System Defined 코드는 코드정의형태 변경 금지
        if (
            row.code_definition_type == "System Defined"
            and "code_definition_type" in data
            and data.get("code_definition_type") != "System Defined"
        ):
            raise PermissionError("System Defined 코드는 코드정의형태를 변경할 수 없습니다.")
        for k, v in data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, minor_code_id: int) -> None:
        row = self.get(minor_code_id)
        if not row:
            raise ValueError("Minor 코드를 찾을 수 없습니다.")
        if row.code_definition_type == "System Defined":
            raise PermissionError("System Defined 코드는 삭제할 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

