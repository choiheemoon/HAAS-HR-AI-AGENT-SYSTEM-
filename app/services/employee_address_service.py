"""직원 주소정보 CRUD (직원당 1행)"""
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_address import EmployeeAddress
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode


class EmployeeAddressService:
    def __init__(self, db: Session):
        self.db = db

    def _find_major_id_by_keywords(
        self, company_id: int, keywords: Sequence[str]
    ) -> Optional[int]:
        majors = (
            self.db.query(MajorCode)
            .filter(MajorCode.company_id == company_id)
            .all()
        )
        lowered = [k.lower() for k in keywords if k]
        for m in majors:
            pool = f"{m.major_code} {(m.name_kor or '')} {(m.name_eng or '')} {(m.name_thai or '')}".lower()
            if any(k in pool for k in lowered):
                return m.id
        return None

    def _find_minor_id(
        self,
        company_id: int,
        major_code_id: Optional[int],
        minor_code: Optional[str],
    ) -> Optional[int]:
        if major_code_id is None:
            return None
        code = (minor_code or "").strip()
        if not code:
            return None
        row = (
            self.db.query(MinorCode)
            .filter(
                MinorCode.company_id == company_id,
                MinorCode.major_code_id == major_code_id,
                MinorCode.minor_code == code,
            )
            .first()
        )
        return int(row.id) if row else None

    def _sync_minor_code_fks(self, emp: Employee, row: EmployeeAddress) -> None:
        """
        employee_addresses의 perm_*/curr_* 값(문자열 minor_code) 기반으로
        *_minor_code_id FK 컬럼을 채워서 minor_codes 삭제가 ON DELETE RESTRICT로 막히게 합니다.
        """
        company_id = getattr(emp, "company_id", None)
        if company_id is None:
            return

        majors_by_field = {
            # frontend/app/employees/page.tsx 키워드와 동일한 편의 키워드
            "nationality": self._find_major_id_by_keywords(
                company_id, ["국적", "Nationality", "สัญชาติ", "nationality"]
            ),
            "zone": self._find_major_id_by_keywords(
                company_id, ["zone", "Zone", "권역", "Zone 정보", "권역정보"]
            ),
            "province": self._find_major_id_by_keywords(
                company_id,
                [
                    "도시정보",
                    "도시",
                    "Province 정보",
                    "Province",
                    "จังหวัด",
                    "province",
                ],
            ),
            "district": self._find_major_id_by_keywords(
                company_id,
                [
                    "시/군/구 정보",
                    "시/군/구",
                    "시군구",
                    "District 정보",
                    "District",
                    "district",
                    "อำเภอ",
                ],
            ),
            "sub_district": self._find_major_id_by_keywords(
                company_id,
                [
                    "동/읍/면 정보",
                    "동/읍/면",
                    "동읍면",
                    "Sub district 정보",
                    "Sub district",
                    "sub district",
                    "ตำบล",
                    "tumbon",
                    "읍",
                    "면",
                ],
            ),
            "postcode": self._find_major_id_by_keywords(
                company_id,
                [
                    "우편번호",
                    "우편 번호",
                    "Postcode",
                    "postcode",
                    "우편번호 정보",
                    "Zip",
                    "zip",
                    "Zip code",
                    "รหัสไปรษณีย์",
                ],
            ),
        }

        parts = ["perm", "curr"]
        fields = ["nationality", "zone", "province", "district", "sub_district", "postcode"]
        for part in parts:
            for f in fields:
                src_val = getattr(row, f"{part}_{f}", None)
                major_id = majors_by_field.get(f)
                minor_id = self._find_minor_id(company_id, major_id, src_val)
                setattr(row, f"{part}_{f}_minor_code_id", minor_id)

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def get_by_employee(self, employee_id: int) -> Optional[EmployeeAddress]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeeAddress)
            .filter(EmployeeAddress.employee_id == employee_id)
            .first()
        )

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
    ) -> List[EmployeeAddress]:
        """주소정보조회: 직원별 주소 API를 반복 호출하지 않도록 일괄 조회."""
        if not allowed_company_ids:
            return []
        q = (
            self.db.query(EmployeeAddress)
            .join(Employee, Employee.id == EmployeeAddress.employee_id)
            .filter(Employee.company_id.in_(allowed_company_ids))
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        return q.order_by(EmployeeAddress.employee_id.asc(), EmployeeAddress.id.asc()).all()

    def create(self, employee_id: int, data: Dict[str, Any]) -> EmployeeAddress:
        self._get_employee_or_raise(employee_id)
        if self.get_by_employee(employee_id):
            raise ValueError("이미 주소정보가 등록되어 있습니다. 수정을 이용하세요.")
        row = EmployeeAddress(employee_id=employee_id, **data)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        emp = self._get_employee_or_raise(employee_id)
        self._sync_minor_code_fks(emp, row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(self, employee_id: int, data: Dict[str, Any]) -> EmployeeAddress:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeeAddress)
            .filter(EmployeeAddress.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("주소정보를 찾을 수 없습니다. 먼저 등록하세요.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        emp = self._get_employee_or_raise(employee_id)
        self._sync_minor_code_fks(emp, row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_id: int) -> None:
        self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeeAddress)
            .filter(EmployeeAddress.employee_id == employee_id)
            .first()
        )
        if not row:
            raise ValueError("주소정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()
