"""회사별 Major 코드 기준정보 서비스"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.major_code import MajorCode


class MajorCodeService:
    def __init__(self, db: Session):
        self.db = db

    def list(self, company_id: Optional[int] = None) -> List[MajorCode]:
        q = self.db.query(MajorCode).order_by(MajorCode.major_code.asc())
        if company_id is not None:
            q = q.filter(MajorCode.company_id == company_id)
        return q.all()

    def get(self, major_code_id: int) -> Optional[MajorCode]:
        return self.db.query(MajorCode).filter(MajorCode.id == major_code_id).first()

    def create(self, data: Dict[str, Any]) -> MajorCode:
        code = (data.get("major_code") or "").strip()
        if not code:
            raise ValueError("Major 코드는 필수입니다.")
        row = MajorCode(**{**data, "major_code": code})
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, major_code_id: int, data: Dict[str, Any]) -> MajorCode:
        row = self.get(major_code_id)
        if not row:
            raise ValueError("Major 코드를 찾을 수 없습니다.")
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

    def delete(self, major_code_id: int) -> None:
        row = self.get(major_code_id)
        if not row:
            raise ValueError("Major 코드를 찾을 수 없습니다.")
        if row.code_definition_type == "System Defined":
            raise PermissionError("System Defined 코드는 삭제할 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

