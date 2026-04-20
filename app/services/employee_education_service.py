"""직원 학력 CRUD"""
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.models.employee import Employee
from app.models.employee_education import EmployeeEducation
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode


class EmployeeEducationService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_raise(self, employee_id: int) -> Employee:
        emp = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    @staticmethod
    def _field_keywords() -> Dict[str, List[str]]:
        return {
            "degree": ["학력코드", "degree"],
            "field_of_study": ["전공코드", "major"],
            "institution": ["학교코드", "school", "institution"],
            "nationality": ["국적", "nationality"],
        }

    def _major_ids_for_company(self, company_id: int) -> Dict[str, int]:
        majors = (
            self.db.query(MajorCode)
            .filter(MajorCode.company_id == company_id)
            .all()
        )
        out: Dict[str, int] = {}
        for field, keywords in self._field_keywords().items():
            hit = next(
                (
                    m
                    for m in majors
                    if any(
                        k.lower()
                        in f"{m.major_code} {m.name_kor or ''} {m.name_eng or ''} {m.name_thai or ''}".lower()
                        for k in keywords
                    )
                ),
                None,
            )
            if hit:
                out[field] = hit.id
        return out

    def _minor_id_by_value(
        self, company_id: int, major_id: int, raw_value: Any
    ) -> int | None:
        v = (str(raw_value or "")).strip()
        if not v:
            return None
        row = (
            self.db.query(MinorCode)
            .filter(
                MinorCode.company_id == company_id,
                MinorCode.major_code_id == major_id,
                MinorCode.minor_code == v,
            )
            .first()
        )
        if row:
            return row.id
        row = (
            self.db.query(MinorCode)
            .filter(
                MinorCode.company_id == company_id,
                MinorCode.major_code_id == major_id,
                MinorCode.name_kor == v,
            )
            .first()
        ) or (
            self.db.query(MinorCode)
            .filter(
                MinorCode.company_id == company_id,
                MinorCode.major_code_id == major_id,
                MinorCode.name_eng == v,
            )
            .first()
        ) or (
            self.db.query(MinorCode)
            .filter(
                MinorCode.company_id == company_id,
                MinorCode.major_code_id == major_id,
                MinorCode.name_thai == v,
            )
            .first()
        )
        return row.id if row else None

    def _sync_minor_code_fks(self, employee: Employee, row: EmployeeEducation) -> None:
        company_id = getattr(employee, "company_id", None)
        if not company_id:
            row.degree_minor_code_id = None
            row.field_of_study_minor_code_id = None
            row.institution_minor_code_id = None
            row.nationality_minor_code_id = None
            return
        major_ids = self._major_ids_for_company(company_id)
        row.degree_minor_code_id = (
            self._minor_id_by_value(company_id, major_ids["degree"], row.degree)
            if major_ids.get("degree")
            else None
        )
        row.field_of_study_minor_code_id = (
            self._minor_id_by_value(
                company_id, major_ids["field_of_study"], row.field_of_study
            )
            if major_ids.get("field_of_study")
            else None
        )
        row.institution_minor_code_id = (
            self._minor_id_by_value(
                company_id, major_ids["institution"], row.institution
            )
            if major_ids.get("institution")
            else None
        )
        row.nationality_minor_code_id = (
            self._minor_id_by_value(
                company_id, major_ids["nationality"], row.nationality
            )
            if major_ids.get("nationality")
            else None
        )

    def _build_minor_lookup(
        self, company_id: int, major_ids: Dict[str, int]
    ) -> Dict[str, Dict[str, int]]:
        out: Dict[str, Dict[str, int]] = {
            "degree": {},
            "field_of_study": {},
            "institution": {},
            "nationality": {},
        }
        for field, major_id in major_ids.items():
            rows = (
                self.db.query(MinorCode)
                .filter(
                    MinorCode.company_id == company_id,
                    MinorCode.major_code_id == major_id,
                )
                .all()
            )
            m: Dict[str, int] = {}
            for r in rows:
                for k in [r.minor_code, r.name_kor, r.name_eng, r.name_thai]:
                    kk = (k or "").strip().lower()
                    if kk:
                        m[kk] = r.id
            out[field] = m
        return out

    def _sync_minor_code_fks_cached(
        self,
        employee: Employee,
        row: EmployeeEducation,
        major_ids: Dict[str, int],
        lookup: Dict[str, Dict[str, int]],
    ) -> None:
        company_id = getattr(employee, "company_id", None)
        if not company_id:
            row.degree_minor_code_id = None
            row.field_of_study_minor_code_id = None
            row.institution_minor_code_id = None
            row.nationality_minor_code_id = None
            return
        row.degree_minor_code_id = (
            lookup["degree"].get((row.degree or "").strip().lower())
            if major_ids.get("degree")
            else None
        )
        row.field_of_study_minor_code_id = (
            lookup["field_of_study"].get((row.field_of_study or "").strip().lower())
            if major_ids.get("field_of_study")
            else None
        )
        row.institution_minor_code_id = (
            lookup["institution"].get((row.institution or "").strip().lower())
            if major_ids.get("institution")
            else None
        )
        row.nationality_minor_code_id = (
            lookup["nationality"].get((row.nationality or "").strip().lower())
            if major_ids.get("nationality")
            else None
        )

    def list_by_employee(self, employee_id: int) -> List[EmployeeEducation]:
        self._get_employee_or_raise(employee_id)
        return (
            self.db.query(EmployeeEducation)
            .filter(EmployeeEducation.employee_id == employee_id)
            .order_by(EmployeeEducation.sort_order.asc())
            .all()
        )

    def list_for_access_scope(
        self,
        allowed_company_ids: List[int],
        company_id: Optional[int] = None,
    ) -> List[EmployeeEducation]:
        """학력조회 등: 직원별 학력 API를 반복 호출하지 않도록 접근 가능 회사 범위로 일괄 조회."""
        if not allowed_company_ids:
            return []
        q = (
            self.db.query(EmployeeEducation)
            .join(Employee, Employee.id == EmployeeEducation.employee_id)
            .filter(Employee.company_id.in_(allowed_company_ids))
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        return (
            q.order_by(
                EmployeeEducation.employee_id.asc(),
                EmployeeEducation.sort_order.asc(),
            ).all()
        )

    def create(self, employee_id: int, data: Dict[str, Any]) -> EmployeeEducation:
        emp = self._get_employee_or_raise(employee_id)
        rows = (
            self.db.query(EmployeeEducation)
            .filter(EmployeeEducation.employee_id == employee_id)
            .order_by(EmployeeEducation.sort_order.asc())
            .all()
        )
        for r in rows:
            r.sort_order = r.sort_order + 1
        row = EmployeeEducation(employee_id=employee_id, sort_order=0, **data)
        self._sync_minor_code_fks(emp, row)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def update(
        self, employee_id: int, education_id: int, data: Dict[str, Any]
    ) -> EmployeeEducation:
        emp = self._get_employee_or_raise(employee_id)
        row = (
            self.db.query(EmployeeEducation)
            .filter(
                EmployeeEducation.id == education_id,
                EmployeeEducation.employee_id == employee_id,
            )
            .first()
        )
        if not row:
            raise ValueError("학력 정보를 찾을 수 없습니다.")
        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)
        self._sync_minor_code_fks(emp, row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete(self, employee_id: int, education_id: int) -> None:
        row = (
            self.db.query(EmployeeEducation)
            .filter(
                EmployeeEducation.id == education_id,
                EmployeeEducation.employee_id == employee_id,
            )
            .first()
        )
        if not row:
            raise ValueError("학력 정보를 찾을 수 없습니다.")
        self.db.delete(row)
        self.db.commit()

    def bulk_save(self, employee_id: int, data: Dict[str, Any]) -> List[EmployeeEducation]:
        emp = self._get_employee_or_raise(employee_id)
        if "education_activity_study" in data:
            emp.education_activity_study = data.get("education_activity_study")
        if "education_certificate" in data:
            emp.education_certificate = data.get("education_certificate")

        incoming_rows = data.get("rows") or []
        existing = (
            self.db.query(EmployeeEducation)
            .filter(EmployeeEducation.employee_id == employee_id)
            .all()
        )
        existing_by_id = {r.id: r for r in existing}

        major_ids: Dict[str, int] = {}
        lookup: Dict[str, Dict[str, int]] = {
            "degree": {},
            "field_of_study": {},
            "institution": {},
            "nationality": {},
        }
        company_id = getattr(emp, "company_id", None)
        if company_id:
            major_ids = self._major_ids_for_company(company_id)
            lookup = self._build_minor_lookup(company_id, major_ids)

        kept_ids: set[int] = set()
        for idx, item in enumerate(incoming_rows):
            row_id = item.get("id")
            row = existing_by_id.get(row_id) if isinstance(row_id, int) else None
            if row is None:
                row = EmployeeEducation(employee_id=employee_id)
                self.db.add(row)
            row.sort_order = idx
            for key in [
                "degree",
                "field_of_study",
                "institution",
                "nationality",
                "from_date",
                "to_date",
                "from_year",
                "to_year",
                "grade",
                "note",
                "educational_qualification",
            ]:
                if key in item:
                    setattr(row, key, item.get(key))
            self._sync_minor_code_fks_cached(emp, row, major_ids, lookup)
            if row.id is not None:
                kept_ids.add(row.id)

        # flush first so new rows get ids
        self.db.flush()
        for r in existing:
            if r.id not in kept_ids and all(
                not (isinstance(i.get("id"), int) and i.get("id") == r.id)
                for i in incoming_rows
            ):
                self.db.delete(r)

        self.db.commit()
        return self.list_by_employee(employee_id)
