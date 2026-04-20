# -*- coding: utf-8 -*-
"""이력서 파서 공통 유틸: 라벨/값 추출, PUA 제거, 주소 정규화."""
import re
from typing import Optional, List

from .constants import EMAIL_PATTERN


def strip_pua(text: str) -> str:
    """PDF 폰트용 Private Use Area 문자 제거 (JobThai 라벨/값 매칭용)."""
    if not text:
        return text
    return re.sub(r"[\uE000-\uF8FF]", "", text)


def extract_label_value(
    text: str, labels: List[str], max_len: int = 2000, email_pattern: re.Pattern = EMAIL_PATTERN
) -> Optional[str]:
    """라벨: 값 형태에서 값 추출 (한/영/태)."""
    for label in labels:
        try:
            pat_same = re.compile(
                re.escape(label) + r"\s*[:：]?\s*([^\n\r]+)",
                re.IGNORECASE | re.DOTALL,
            )
            m = pat_same.search(text)
            if m:
                val = m.group(1).strip()
                if val and len(val) < max_len and not email_pattern.match(val):
                    return val
            pat_next = re.compile(
                re.escape(label) + r"\s*[:：]?\s*\n\s*([^\n\r]+)",
                re.IGNORECASE | re.DOTALL,
            )
            m = pat_next.search(text)
            if m:
                val = m.group(1).strip()
                if val and len(val) < max_len and not email_pattern.match(val):
                    return val
        except re.error:
            continue
    return None


def extract_numeric_after_label(
    text: str, labels: List[str], max_len: int = 50
) -> Optional[str]:
    """라벨 다음에 오는 숫자(급여 등) 추출."""
    for label in labels:
        try:
            pat = re.compile(
                re.escape(label) + r"\s*[:：]?\s*(?:\S+\s+)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*",
                re.IGNORECASE,
            )
            m = pat.search(text)
            if m:
                return m.group(1).strip()[:max_len]
            pat2 = re.compile(
                re.escape(label) + r"\s*[:：]?\s*\n\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)",
                re.IGNORECASE,
            )
            m2 = pat2.search(text)
            if m2:
                return m2.group(1).strip()[:max_len]
            pat3 = re.compile(
                re.escape(label) + r"\s*[:：]?\s*[^\d]{0,80}?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)",
                re.IGNORECASE | re.DOTALL,
            )
            m3 = pat3.search(text)
            if m3:
                return m3.group(1).strip()[:max_len]
        except re.error:
            continue
    return None


def extract_label_value_multiline(
    text: str,
    labels: List[str],
    max_lines: int = 2,
    max_len: int = 3000,
    email_pattern: re.Pattern = EMAIL_PATTERN,
) -> Optional[str]:
    """라벨 다음 1~max_lines 줄을 값으로 추출."""
    for label in labels:
        try:
            pat_same = re.compile(
                re.escape(label) + r"\s*[:：]?\s*([^\n\r]+)",
                re.IGNORECASE | re.DOTALL,
            )
            m = pat_same.search(text)
            if m:
                val = m.group(1).strip()
                if val and len(val) < max_len and not email_pattern.match(val):
                    return val
            n = max(1, min(max_lines, 5))
            pat_next = re.compile(
                re.escape(label) + r"\s*[:：]?\s*\n\s*((?:[^\n\r]+\n?){1," + str(n) + r"})",
                re.IGNORECASE | re.DOTALL,
            )
            m = pat_next.search(text)
            if m:
                val = m.group(1).strip()
                if val and len(val) < max_len and not email_pattern.match(val):
                    return val
        except re.error:
            continue
    return None


def normalize_address_value(addr: Optional[str]) -> Optional[str]:
    """추출된 주소에서 라벨 접두어 및 꼬리(Email, Mobile 등) 제거."""
    if not addr or not isinstance(addr, str):
        return addr
    s = addr.strip()
    s = re.sub(r"^[\s\uE000-\uF8FF]*(?:ที่อยู่|ที่อยู)[\s\uE000-\uF8FF]*[:：]?[\s\uE000-\uF8FF]*", "", s)
    s = re.sub(r"\s*(?:Email|อีเมล|E-?mail)\s+[^\s]+@[^\s]+.*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*(?:Mobile|โทรศัพท์|เบอร์|Line|ไลน์)\s+.*$", "", s, flags=re.IGNORECASE)
    s = s.strip()
    return s[:3000] if s else None
