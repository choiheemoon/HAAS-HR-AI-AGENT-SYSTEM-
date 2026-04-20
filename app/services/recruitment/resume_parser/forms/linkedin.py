# -*- coding: utf-8 -*-
"""LinkedIn(양식3/4) 전용 파싱 로직."""
from typing import Dict, Optional, Any


def parse_header(parser: Any, raw_text: str) -> Dict[str, Optional[str]]:
    """LinkedIn(양식3/4) 전용 헤더: 지원 직위, 수정일 등. 필요 시 확장."""
    return {"applied_position": None, "update_date": None}
