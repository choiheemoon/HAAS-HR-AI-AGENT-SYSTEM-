"""기준정보 서비스"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from app.models.employee import Employee
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.document import Document
from app.models.audit import AuditLog
from app.utils.validators import validate_employee_data, validate_resident_number
from app.utils.encryption import encrypt_sensitive_data, decrypt_sensitive_data


def _json_sanitize(value: Any) -> Any:
    """AuditLog JSON 컬럼용: date/datetime 등 JSON 비호환 값을 직렬화 가능 형태로 변환"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(k): _json_sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_sanitize(v) for v in value]
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


class MasterDataService:
    """기준정보 서비스"""
    
    def __init__(self, db: Session):
        self.db = db

    def _assert_unique_swipe_card_in_company(
        self,
        *,
        company_id: Optional[int],
        swipe_card: Optional[str],
        exclude_employee_id: Optional[int] = None,
    ) -> None:
        card = str(swipe_card or "").strip()
        if company_id is None or not card:
            return
        q = self.db.query(Employee).filter(
            Employee.company_id == company_id,
            Employee.swipe_card == card,
        )
        if exclude_employee_id is not None:
            q = q.filter(Employee.id != exclude_employee_id)
        dup = q.first()
        if dup:
            raise ValueError("동일 회사에서 출입카드번호 중복입니다.")
    
    def create_employee(self, employee_data: Dict[str, Any], user_id: Optional[int] = None) -> Employee:
        """직원 정보 생성"""
        # 데이터 검증
        validate_employee_data(employee_data)

        # 회사별 사번 중복 방지(요구사항)
        company_id = employee_data.get("company_id")
        emp_no = employee_data.get("employee_number")
        if company_id is not None and emp_no is not None:
            dup = (
                self.db.query(Employee)
                .filter(
                    Employee.company_id == company_id,
                    Employee.employee_number == emp_no,
                )
                .first()
            )
            if dup:
                raise ValueError("동일 회사에서 사번 중복입니다.")

        # 회사 내 출입카드번호 중복 방지(값이 있을 때만)
        self._assert_unique_swipe_card_in_company(
            company_id=company_id,
            swipe_card=employee_data.get("swipe_card"),
        )
        
        # 주민등록번호 암호화
        if "resident_number" in employee_data:
            employee_data["resident_number"] = encrypt_sensitive_data(employee_data["resident_number"])
        
        employee = Employee(**employee_data)
        self.db.add(employee)
        self.db.flush()
        self._sync_employee_reference_fks(employee)
        self.db.commit()
        self.db.refresh(employee)
        
        # 감사 로그 기록
        self._log_audit(user_id, "create", "employee", employee.id, None, employee_data)
        
        return employee
    
    def update_employee(self, employee_id: int, employee_data: Dict[str, Any], user_id: Optional[int] = None) -> Employee:
        """직원 정보 수정"""
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError("직원을 찾을 수 없습니다.")
        
        # 변경 전 상태 저장
        before_state = self._serialize_employee(employee)
        
        # 데이터 검증
        validate_employee_data(employee_data, is_update=True)
        
        # 주민등록번호 암호화
        if "resident_number" in employee_data:
            employee_data["resident_number"] = encrypt_sensitive_data(employee_data["resident_number"])
        
        # 필드 업데이트
        # 회사/사번 중복 체크(요구사항)
        if "company_id" in employee_data or "employee_number" in employee_data:
            target_company_id = employee_data.get("company_id", employee.company_id)
            target_emp_no = employee_data.get("employee_number", employee.employee_number)
            dup = (
                self.db.query(Employee)
                .filter(
                    Employee.company_id == target_company_id,
                    Employee.employee_number == target_emp_no,
                    Employee.id != employee_id,
                )
                .first()
            )
            if dup:
                raise ValueError("동일 회사에서 사번 중복입니다.")

        # 회사 내 출입카드번호 중복 체크(요구사항)
        if "company_id" in employee_data or "swipe_card" in employee_data:
            target_company_id = employee_data.get("company_id", employee.company_id)
            target_swipe_card = employee_data.get("swipe_card", employee.swipe_card)
            self._assert_unique_swipe_card_in_company(
                company_id=target_company_id,
                swipe_card=target_swipe_card,
                exclude_employee_id=employee_id,
            )

        for key, value in employee_data.items():
            if hasattr(employee, key):
                setattr(employee, key, value)

        self._sync_employee_reference_fks(employee)

        employee.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(employee)
        
        # 변경 내용 추적
        changes = self._calculate_changes(before_state, employee_data)
        self._log_audit(user_id, "update", "employee", employee_id, before_state, employee_data, changes)
        
        return employee
    
    def _reference_item_id(
        self,
        company_id: Optional[int],
        category: str,
        code: Optional[str],
    ) -> Optional[int]:
        if company_id is None:
            return None
        c = (code or "").strip()
        if not c:
            return None
        row = (
            self.db.query(EmployeeReferenceItem)
            .filter(EmployeeReferenceItem.company_id == company_id)
            .filter(EmployeeReferenceItem.category == category)
            .filter(EmployeeReferenceItem.code == c)
            .first()
        )
        return row.id if row else None

    def _sync_employee_reference_fks(self, employee: Employee) -> None:
        """코드 문자열과 동일한 기준정보 행이 있으면 FK를 맞춥니다. 없으면 NULL(코드만 유지)."""
        co = employee.company_id
        employee.department_item_id = self._reference_item_id(co, "department", employee.department)
        employee.job_level_item_id = self._reference_item_id(co, "level", employee.job_level)
        employee.position_item_id = self._reference_item_id(co, "position", employee.position)
        employee.employment_type_item_id = self._reference_item_id(
            co, "employment_type", employee.employment_type
        )
        employee.salary_process_type_item_id = self._reference_item_id(
            co, "employee_type", employee.salary_process_type
        )
        employee.division_item_id = self._reference_item_id(co, "division", employee.division)
        employee.work_place_item_id = self._reference_item_id(co, "work_place", employee.work_place)
        employee.area_item_id = self._reference_item_id(co, "area", employee.area)
        employee.work_status_item_id = self._reference_item_id(co, "work_status", employee.work_status)
        employee.employee_level_item_id = self._reference_item_id(
            co, "employee_level", employee.employee_level
        )

    def get_employee(self, employee_id: int) -> Optional[Employee]:
        """직원 정보 조회"""
        return self.db.query(Employee).filter(Employee.id == employee_id).first()
    
    def soft_delete_employee(self, employee_id: int, user_id: Optional[int] = None) -> Employee:
        """직원 퇴사 처리(소프트 삭제)"""
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise ValueError("직원을 찾을 수 없습니다.")
        before_state = self._serialize_employee(employee)
        employee.status = "terminated"
        employee.termination_date = date.today()
        employee.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(employee)
        self._log_audit(
            user_id,
            "soft_delete",
            "employee",
            employee_id,
            before_state,
            {"status": "terminated", "termination_date": str(employee.termination_date)},
        )
        return employee

    def get_employees(self, filters: Optional[Dict[str, Any]] = None) -> List[Employee]:
        """직원 목록 조회"""
        query = self.db.query(Employee)
        
        if filters:
            if "company_ids" in filters:
                query = query.filter(
                    Employee.company_id.in_(filters["company_ids"])
                )
            if "company_id" in filters:
                query = query.filter(
                    Employee.company_id == filters["company_id"]
                )
            if "department" in filters:
                query = query.filter(Employee.department == filters["department"])
            if "status" in filters:
                query = query.filter(Employee.status == filters["status"])
            if "position" in filters:
                query = query.filter(Employee.position == filters["position"])
        
        return query.all()

    def employee_self_service_update(self, employee_id: int, update_data: Dict[str, Any]) -> Employee:
        """직원 셀프서비스 업데이트"""
        # 셀프서비스에서 수정 가능한 필드만 허용
        allowed_fields = ["phone", "address", "bank_name", "bank_account", "emergency_contact"]
        
        filtered_data = {k: v for k, v in update_data.items() if k in allowed_fields}
        
        return self.update_employee(employee_id, filtered_data, user_id=employee_id)
    
    def create_document(self, employee_id: int, document_data: Dict[str, Any]) -> Document:
        """문서 생성"""
        document = Document(employee_id=employee_id, **document_data)
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document
    
    def get_documents(self, employee_id: Optional[int] = None, document_type: Optional[str] = None) -> List[Document]:
        """문서 목록 조회"""
        query = self.db.query(Document)
        
        if employee_id:
            query = query.filter(Document.employee_id == employee_id)
        if document_type:
            query = query.filter(Document.document_type == document_type)
        
        return query.all()
    
    def check_expiring_documents(self, days_ahead: int = 30) -> List[Document]:
        """만료 예정 문서 조회"""
        from datetime import date, timedelta
        expiry_threshold = date.today() + timedelta(days=days_ahead)
        
        return self.db.query(Document).filter(
            Document.expiry_date <= expiry_threshold,
            Document.expiry_date >= date.today(),
            Document.is_expired == False
        ).all()
    
    def sync_with_external_systems(self, employee_id: int, system_name: str) -> Dict[str, Any]:
        """외부 시스템과 동기화"""
        employee = self.get_employee(employee_id)
        if not employee:
            raise ValueError("직원을 찾을 수 없습니다.")
        
        # 실제로는 외부 시스템 API를 호출하여 동기화
        # 예: 급여 시스템, 회계 시스템 등
        
        sync_result = {
            "system": system_name,
            "employee_id": employee_id,
            "synced_at": datetime.utcnow().isoformat(),
            "status": "success"
        }
        
        return sync_result
    
    def _serialize_employee(self, employee: Employee) -> Dict[str, Any]:
        """직원 객체를 딕셔너리로 변환"""
        return {
            "name": employee.name,
            "email": employee.email,
            "department": employee.department,
            "position": employee.position,
            "base_salary": employee.base_salary,
            # 필요한 필드만 포함
        }
    
    def _calculate_changes(self, before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
        """변경 내용 계산"""
        changes = {}
        for key, new_value in after.items():
            old_value = before.get(key)
            if old_value != new_value:
                changes[key] = {"old": old_value, "new": new_value}
        return changes
    
    def _log_audit(self, user_id: Optional[int], action: str, resource_type: str, 
                   resource_id: int, before_state: Optional[Dict], after_state: Optional[Dict],
                   changes: Optional[Dict] = None):
        """감사 로그 기록"""
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            before_state=_json_sanitize(before_state) if before_state is not None else None,
            after_state=_json_sanitize(after_state) if after_state is not None else None,
            changes=_json_sanitize(changes) if changes is not None else {},
        )
        self.db.add(audit_log)
        self.db.commit()
