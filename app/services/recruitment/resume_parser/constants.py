# -*- coding: utf-8 -*-
"""이력서 파서 공통 상수·정규식 패턴."""
import re

# 이메일 패턴 (한/영/태 공통)
EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)
# 전화번호 패턴 (한국 010-, 태국 061-888-4187, 국제 +66 등)
PHONE_PATTERN = re.compile(
    r"(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}(?:[-.\s]?\d+)?"
)
# 연락처 라벨 다음 번호 추출 (양식2 Jobthai: Mobile 061-888-4187 등)
PHONE_LABEL_PATTERNS = [
    re.compile(r"Mobile\s*[:：]?\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Tel(?:ephone)?\s*[:：]?\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Phone\s*[:：]?\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Contact\s*[:：]?\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"โทรศัพท์\s*[:：]?\s*([^\n\r]+)"),
    re.compile(r"เบอร์\s*[:：]?\s*([^\n\r]+)"),
    re.compile(r"(?:연락처|전화)\s*[:：]?\s*([^\n\r]+)"),
]
# 이름 라벨
NAME_LABELS_KO = re.compile(r"(?:이름|성명|지원자)\s*[:：]?\s*([^\n\r]+)", re.IGNORECASE)
NAME_LABELS_EN = re.compile(r"(?:Name|Applicant|Candidate)\s*[:]?\s*([^\n\r]+)", re.IGNORECASE)
NAME_LABELS_TH = re.compile(r"(?:ชื่อ|ชื่อ-นามสกุล)\s*[:]?\s*([^\n\r]+)", re.IGNORECASE)

EDUCATION_LABELS = re.compile(
    r"(?:Education|학력|การศึกษา|Academic|Qualifications|ประวัติการศึกษา)",
    re.IGNORECASE,
)
SKILLS_LABELS = re.compile(
    r"(?:Skills|기술|능력|ทักษะ|Summary|요약|สรุป|Objective|목표)",
    re.IGNORECASE,
)

# 이름 제외 후보 (라벨/섹션명)
NAME_EXCLUDE = (
    "ใบอนุญาต", "ประกอบวิชาชีพ", "ประกอบวชาชีพ", "license", "all rights reserved", "©",
    "linkedin", "profile", "resume", "curriculum vitae", "cv",
    "contact", "application info", "summary", "experience", "education", "skills",
    "certifications", "about", "overview", "career", "employment", "contact info", "contact information",
)
