"""데이터 검증 유틸리티"""
import re
from typing import Dict, Any
from datetime import date


def validate_employee_data(data: Dict[str, Any], is_update: bool = False):
    """직원 데이터 검증"""
    if not is_update:
        required_fields = ["company_id", "employee_number", "name", "email", "hire_date"]
        for field in required_fields:
            if field not in data or data.get(field) is None:
                raise ValueError(f"필수 필드가 없습니다: {field}")
        if data.get("status") == "terminated" and not data.get("termination_date"):
            raise ValueError("퇴사 상태에서는 퇴사일이 필요합니다.")

    if "company_id" in data and data.get("company_id") is not None:
        if not isinstance(data["company_id"], int):
            raise ValueError("유효하지 않은 회사 정보입니다.")
    
    # 이메일 형식 검증
    if "email" in data:
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, data["email"]):
            raise ValueError("유효하지 않은 이메일 형식입니다.")
    
    # 날짜 형식 검증
    if "hire_date" in data and data["hire_date"] is not None:
        if not isinstance(data["hire_date"], date):
            raise ValueError("유효하지 않은 날짜 형식입니다.")
    if "birth_date" in data and data.get("birth_date") is not None:
        if not isinstance(data["birth_date"], date):
            raise ValueError("유효하지 않은 생년월일 형식입니다.")
    if "termination_date" in data and data.get("termination_date") is not None:
        if not isinstance(data["termination_date"], date):
            raise ValueError("유효하지 않은 퇴사일 형식입니다.")


def validate_resident_number(resident_number: str) -> bool:
    """주민등록번호 검증"""
    if not resident_number or len(resident_number) != 13:
        return False
    
    # 간단한 검증 (실제로는 더 복잡한 로직 필요)
    return resident_number.isdigit()


def mask_resident_number_for_display(raw: str) -> str:
    """주민등록번호 표시용 마스킹 (예: 771130-1******)"""
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 7:
        return f"{digits[:6]}-{digits[6]}******"
    s = raw.strip()
    parts = s.split("-", 1)
    if len(parts) == 2 and len(parts[0]) == 6 and len(parts[1]) >= 1:
        return f"{parts[0]}-{parts[1][0]}******"
    return raw


def validate_date_format(date_str: str) -> bool:
    """날짜 형식 검증"""
    try:
        date.fromisoformat(date_str)
        return True
    except ValueError:
        return False
