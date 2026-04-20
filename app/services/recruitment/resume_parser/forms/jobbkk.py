# -*- coding: utf-8 -*-
"""Jobbkk(양식1) 전용 파싱 로직."""
from typing import Dict, Optional, Any


def parse_header(parser: Any, raw_text: str) -> Dict[str, Optional[str]]:
    """Jobbkk(양식1) 전용 헤더: 지원 직위, 최종 수정일 등. 필요 시 확장."""
    return {"applied_position": None, "update_date": None}
