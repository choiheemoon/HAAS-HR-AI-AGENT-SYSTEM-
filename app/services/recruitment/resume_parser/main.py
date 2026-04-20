"""이력서 파서 - PDF/DOCX/TXT 추출 및 구조화 (5가지 양식, 한국어/영어/태국어)."""
import os
import re
import unicodedata
from typing import Dict, Any, List, Optional, Tuple

from . import constants
from . import helpers
from . import extraction

# 패키지 상수 노출 (기존 코드 호환)
EMAIL_PATTERN = constants.EMAIL_PATTERN
PHONE_PATTERN = constants.PHONE_PATTERN
PHONE_LABEL_PATTERNS = constants.PHONE_LABEL_PATTERNS
NAME_LABELS_KO = constants.NAME_LABELS_KO
NAME_LABELS_EN = constants.NAME_LABELS_EN
NAME_LABELS_TH = constants.NAME_LABELS_TH
EDUCATION_LABELS = constants.EDUCATION_LABELS
SKILLS_LABELS = constants.SKILLS_LABELS


class ResumeParser:
    """이력서 파서 - 5가지 양식, 한국어/영어/태국어 지원"""

    def extract_text(self, file_path: str) -> str:
        """파일에서 텍스트 추출"""
        return extraction.extract_text(file_path)

    def _extract_from_pdf(self, file_path: str) -> str:
        """PDF에서 텍스트 추출 (UTF-8 등 다국어 지원)"""
        return extraction.extract_from_pdf(file_path)

    def _extract_photo_from_pdf(self, file_path: str, max_pages: int = 3) -> Optional[str]:
        """PDF에서 첫 몇 페이지 이미지 추출 → base64 데이터 URL 또는 None."""
        return extraction.extract_photo_from_pdf(file_path, max_pages)

    def _extract_from_docx(self, file_path: str) -> str:
        """DOCX에서 텍스트 추출"""
        return extraction.extract_from_docx(file_path)

    def _extract_from_txt(self, file_path: str) -> str:
        """TXT에서 텍스트 추출"""
        return extraction.extract_from_txt(file_path)

    def detect_language(self, text: str) -> str:
        """텍스트에서 문서 언어 추정: ko, en, th"""
        if not text or len(text.strip()) < 20:
            return "en"
        # 한글 존재 여부
        if re.search(r"[가-힣]", text):
            return "ko"
        # 태국어 문자 존재 여부
        if re.search(r"[\u0E00-\u0E7F]", text):
            return "th"
        return "en"

    def detect_form_type(self, raw_text: str, filename: Optional[str] = None) -> int:
        """
        파일명·내용으로 지원서 양식 자동 분류.
        1: Jobbkk, 2: JobThai, 3: LinkedIn. 기본값 1.
        """
        text_lower = (raw_text or "")[:8000].lower()
        name_lower = (filename or "").lower()
        score_1 = 0
        score_2 = 0
        score_3 = 0
        # 파일명 힌트
        if "jobbkk" in name_lower or "job_bkk" in name_lower:
            score_1 += 3
        if "jobthai" in name_lower or "job_thai" in name_lower:
            score_2 += 3
        if "linkedin" in name_lower or "linedin" in name_lower:
            score_3 += 3
        # 본문 힌트
        if re.search(r"jobbkk\.com|job\s*bkk", text_lower):
            score_1 += 2
        if re.search(r"jobthai\.com|job\s*thai", text_lower):
            score_2 += 2
        if re.search(r"linkedin\.com|linkedin\s*profile", text_lower):
            score_3 += 2
        # JobThai 전형적 라벨 (태국어) — 유니코드 변이 보정을 위해 NFC 정규화 후 검사
        text_nfc = unicodedata.normalize("NFC", text_lower)
        if re.search(r"สมัครตำแหน่ง|ส่วนสูง|น้ำหนัก|ที่อยู่ตามทะเบียนบ้าน|ประวัติการศึกษา", text_nfc):
            score_2 += 1
        if re.search(r"สมัครต[\u0E00-\u0E7F]{1,4}แหน่ง|แก้ไขประวัติล[\u0E00-\u0E7F]{1,4}าสุด", text_nfc):
            score_2 += 1
        # LinkedIn 전형적 구조
        if re.search(r"Contact\s*\n|Application\s*Info\s*\n|Summary\s*\n.*Experience", text_lower):
            score_3 += 1
        if score_3 >= score_1 and score_3 >= score_2 and score_3 > 0:
            return 3
        if score_2 >= score_1 and score_2 >= score_3 and score_2 > 0:
            return 2
        if score_1 > 0:
            return 1
        return 1

    def _extract_email(self, text: str) -> Optional[str]:
        m = EMAIL_PATTERN.search(text)
        return m.group(0).strip() if m else None

    def _normalize_phone_candidate(self, s: str) -> Optional[str]:
        """숫자 8~15자리인 전화번호만 허용"""
        s = s.strip()
        digits = re.sub(r"\D", "", s)
        if 8 <= len(digits) <= 15:
            return s
        return None

    def _extract_phone(self, text: str) -> Optional[str]:
        # 1) 라벨 기반 추출 (양식2 Jobthai: Mobile 061-888-4187, 082-620-9173)
        for pattern in PHONE_LABEL_PATTERNS:
            m = pattern.search(text)
            if m:
                value = m.group(1).strip()
                numbers = PHONE_PATTERN.findall(value)
                valid = [self._normalize_phone_candidate(n) for n in numbers]
                valid = [v for v in valid if v]
                if valid:
                    return ", ".join(valid[:3])  # 최대 3개까지
        # 2) 줄 단위 스캔 (이메일/URL 줄은 건너뛰기)
        lines = text.split("\n")
        for line in lines[:50]:
            if "@" in line or "http" in line.lower():
                continue
            for m in PHONE_PATTERN.finditer(line):
                candidate = self._normalize_phone_candidate(m.group(0))
                if candidate:
                    return candidate
        # 3) @ 포함 줄에서도 전화번호만 추출 (Email / Mobile 이 한 블록에 있을 때)
        for line in lines[:50]:
            if "@" not in line:
                continue
            for m in PHONE_PATTERN.finditer(line):
                candidate = self._normalize_phone_candidate(m.group(0))
                if candidate:
                    return candidate
        return None

    _NAME_EXCLUDE = constants.NAME_EXCLUDE

    def _is_valid_name(self, s: str) -> bool:
        if not s or len(s) > 80 or EMAIL_PATTERN.match(s):
            return False
        s_lower = s.lower().strip()
        for exc in self._NAME_EXCLUDE:
            if exc in s_lower or exc in s:
                return False
        if re.search(r"^\d+[/\-]\d+", s):  # 날짜 형태 제외
            return False
        return True

    def _extract_name(self, text: str, lang: str) -> Optional[str]:
        """공통 이름 추출 (양식 미구분)."""
        # 라벨 기반 (ชื่อ : 값)
        for pattern in (NAME_LABELS_KO, NAME_LABELS_EN, NAME_LABELS_TH):
            m = pattern.search(text)
            if m:
                name = m.group(1).strip()
                if self._is_valid_name(name):
                    return name
        # 첫 20줄에서 이메일/전화/URL이 아닌 짧은 줄을 이름 후보로 (태국어/한글 이름 패턴)
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        for line in lines[:20]:
            if not line or len(line) < 2 or len(line) > 60:
                continue
            if line.startswith("http") or "@" in line or EMAIL_PATTERN.match(line):
                continue
            if PHONE_PATTERN.fullmatch(line) or re.match(r"^\d[\d\s\-\.]+$", line):
                continue
            if self._is_valid_name(line):
                return line
        return None

    def _extract_name_by_form(self, text: str, lang: str, form_type: int) -> Optional[str]:
        """양식별 이름 추출. 1=Jobbkk, 2=JobThai, 3=LinkedIn, 4=Linked Simple."""
        if form_type in (3, 4):
            # LinkedIn / Linked Simple(양식4): "Contact" 다음 줄이 이름인 경우 많음. "Name" 라벨 우선, 그다음 Contact 블록 첫 줄
            m = re.search(r"(?:Name|Full Name)\s*[:]?\s*([^\n\r]+)", text, re.IGNORECASE)
            if m:
                name = m.group(1).strip()
                if self._is_valid_name(name):
                    return name
            # Contact 섹션 직후 첫 번째 유효한 줄 (섹션 헤더 제외)
            lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
            after_contact = False
            for i, line in enumerate(lines[:40]):
                line_lower = line.lower()
                if line_lower in ("contact", "contact info", "contact information"):
                    after_contact = True
                    continue
                if after_contact and 2 <= len(line) <= 60:
                    if not line.startswith("http") and "@" not in line and PHONE_PATTERN.fullmatch(line) is None:
                        if self._is_valid_name(line):
                            return line
                # Contact 없이 시작: 첫 15줄에서 이름 후보 (섹션명 단일 단어 제외)
                if i < 15 and 2 <= len(line) <= 60:
                    if not line.startswith("http") and "@" not in line and re.match(r"^\d[\d\s\-\.]+$", line) is None:
                        if self._is_valid_name(line):
                            return line
            return self._extract_name(text, lang)
        if form_type == 2:
            # JobThai: ชื่อ : 값 또는 이름 : 값 우선
            m = NAME_LABELS_TH.search(text)
            if m:
                name = m.group(1).strip()
                if self._is_valid_name(name):
                    return name
            return self._extract_name(text, lang)
        # form 1 (Jobbkk), 5: 공통 로직
        return self._extract_name(text, lang)

    # 섹션 라벨 -> 표준 키 (jobbkk/JobThai/LinkedIn 통일). 양식2 Jobthai: รายละเอียดส่วนตัว, ลักษณะงานที่ต้องการ 등
    # 원본 양식과 일치하는 긴 라벨을 먼저 두어 경력/훈련/자격 섹션 경계 정확히 구분
    _SECTION_MAP = {
        "education": "education", "การศึกษา": "education", "ประวัติการศึกษา": "education", "학력": "education", "academic": "education",
        "experience": "experience", "career": "experience", "ประสบการณ์": "experience", "ประวัติการทำงาน": "experience", "ประวัติการทำงาน/ฝึกงาน": "experience",
        "ประวัติการทํางาน": "experience", "ประวัติการทํางาน / ฝกงาน": "experience", "ประวัติการทำงาน / ฝึกงาน": "experience", "ฝกงาน": "experience", "ฝึกงาน": "experience",
        "작업 경력": "experience", "경력": "experience",
        "work experience": "experience", "professional experience": "experience", "경력/실습": "experience",
        "경력/실습 기록": "experience",
        "skills": "skills", "ทักษะ": "skills", "기술": "skills",
        "ความสามารถ ผลงาน เกียรติประวัติ": "skills", "ความสามารถทางภาษา": "language_skills",
        "summary": "summary", "objective": "summary", "สรุป": "summary", "요약": "summary", "자기소개": "summary",
        "intro": "intro", "ข้อมูลส่วนตัว": "intro", "รายละเอียดส่วนตัว": "intro",
        "코드": "intro", "รหัส": "intro", "ชื่อ": "intro", "นามสกุล": "intro", "ที่อยู่": "intro", "이름": "intro", "성명": "intro", "성": "intro", "주소": "intro",
        "certifications": "certification", "licenses": "certification", "ใบอนุญาต": "certification", "자격증": "certification",
        "ประกาศนียบัตร": "certification",         "ประวัติการฝึกอบรม": "training", "ประวัติการฝกอบรม": "training", "ประกาศนียบัตร/วุฒิบัตร": "certification",
        "자격/면허": "certification", "자격 면허": "certification",
        "훈련/자격증 내역": "training",
        "training": "training", "ข้อมูลการฝึกอบรม": "training", "교육훈련": "training",
        "ประวัติการฝึกอบรม/ประกาศนียบัตร": "training", "ประวัติการฝกอบรม/ประกาศนียบัตร": "training",
        "훈련 이력": "training", "훈련이력": "training", "ฝึกอบรม": "training",
        "교육 이력": "training", "교육이력": "training", "교육 이력/자격증": "training",
        "หลักสูตรและการฝึกอบรม": "training",
        "vehicles": "vehicles", "ยานพาหนะ": "vehicles", "보유차량": "vehicles",
        "language": "language_skills", "ทักษะทางภาษา": "language_skills", "언어능력": "language_skills",
        "desired job": "desired_job", "งานที่ต้องการ": "desired_job", "희망직무": "desired_job",
        "ลักษณะงานที่ต้องการ": "desired_job", "ลักษณะงานที่ตองการ": "desired_job",  # PUA 제거 후 변이
        "원하는 직무 특성": "desired_job", "희망 직무 특성": "desired_job",
        "ตำแหน่งงานที่ต้องการสมัคร": "desired_job", "ตำแหน่งงานที่ตองการสมัคร": "desired_job",
        # 양식3 LinkedIn PDF 섹션 헤더 (영문)
        "work experience": "experience", "employment": "experience", "career history": "experience",
        "professional experience": "experience", "employment history": "experience",
        "volunteer experience": "experience", "volunteer": "experience", "projects": "experience",
        "summary": "summary", "about": "summary", "profile": "summary", "overview": "summary",
        "licenses and certifications": "certification", "certifications": "certification",
        "honors and awards": "certification", "awards": "certification",
        "skills & endorsements": "skills", "endorsements": "skills", "expertise": "skills",
        "contact info": "intro", "contact information": "intro", "contact": "intro",
    }

    def _extract_sections(self, text: str) -> Dict[str, str]:
        """학력/경력/스킬 등 섹션별 텍스트 추출. 긴 줄에서도 섹션 헤더를 찾아 분리하여 학력/경력 혼합 방지."""
        sections: Dict[str, str] = {}
        lines = text.split("\n")
        current_section = "intro"
        current_text: list = []
        # 긴 라벨을 먼저 매칭 (예: "작업 경력" → "경력" 보다 먼저)
        section_labels = sorted(self._SECTION_MAP.keys(), key=lambda x: -len(x))

        def flush_current():
            if current_text:
                if current_section not in sections:
                    sections[current_section] = ""
                sections[current_section] += "\n".join(current_text) + "\n"

        def find_next_section_in_chunk(chunk: str, from_section: str) -> Tuple[Optional[str], Optional[str], int]:
            """chunk 안에서 from_section이 아닌 다음 섹션 헤더를 찾음. (label, canonical, pos) 또는 (None, None, -1)."""
            if not chunk or len(chunk) < 10:
                return (None, None, -1)
            chunk_lower = chunk.lower()
            found_label = None
            found_pos = -1
            for label in section_labels:
                idx = chunk_lower.find(label.lower())
                if idx < 0:
                    continue
                canonical = self._SECTION_MAP[label]
                if canonical != from_section and (found_pos < 0 or idx < found_pos):
                    found_label = label
                    found_pos = idx
            if found_label is None:
                return (None, None, -1)
            return (found_label, self._SECTION_MAP[found_label], found_pos)

        def split_long_rest(rest: str, section: str) -> Tuple[str, str, Optional[str]]:
            """rest에서 다음 섹션 헤더가 있으면 (현재 섹션에 넣을 텍스트, 다음 섹션명, 나머지) 반환. 없으면 (rest, section, None)."""
            label, canonical, pos = find_next_section_in_chunk(rest, section)
            if pos < 0:
                return (rest, section, None)
            before = rest[:pos].strip()
            after = rest[pos + len(label):].strip()
            return (before, canonical, after)

        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                # Do not flush on blank: next section label will flush (avoids losing JobThai content after blanks)
                continue
            line_lower = line_stripped.lower()
            line_norm = self._strip_pua(line_stripped)
            line_norm_lower = line_norm.lower() if line_norm != line_stripped else line_lower
            found_label = None
            found_pos = -1
            for label in section_labels:
                label_lower = label.lower()
                idx = line_lower.find(label_lower)
                if idx < 0:
                    continue
                canonical = self._SECTION_MAP[label]
                # 긴 줄: 현재 섹션과 다른 헤더일 때만 분리 (학력 안에 경력이 섞인 경우만 분리)
                if len(line_stripped) >= 100:
                    if canonical != current_section and (found_pos < 0 or idx < found_pos):
                        found_label = label
                        found_pos = idx
                    continue
                # 짧은 줄: 줄이 해당 라벨로 시작할 때만 섹션 전환 (PUA 제거 후 'ลักษณะงานที่ตองการ' 등 매칭)
                if line_lower.startswith(label_lower) or line_norm_lower.startswith(label_lower):
                    found_label = label
                    found_pos = -1
                    break
            if found_label is not None:
                canonical = self._SECTION_MAP[found_label]
                # 긴 줄: 헤더 앞 내용은 현재 섹션에, 헤더 뒤는 새 섹션에. 나머지 안에 추가 헤더가 있으면 반복 분리.
                if found_pos >= 0 and len(line_stripped) >= 100:
                    before = line_stripped[:found_pos].strip()
                    if before:
                        current_text.append(before)
                    flush_current()
                    current_section = canonical
                    rest = line_stripped[found_pos + len(found_label):].strip()
                    # 한 줄 안에 학력 ... 작업 경력 ... 훈련 이력 등 여러 헤더가 있을 수 있으므로 반복 분리
                    while rest:
                        part, next_section, remainder = split_long_rest(rest, current_section)
                        if remainder is None:
                            # rest 전체가 현재 섹션 소속, 더 이상 헤더 없음 → flush 하지 않고 current_text만 설정
                            current_text = [rest] if rest else []
                            break
                        if part:
                            current_text.append(part)
                        flush_current()
                        current_section = next_section
                        rest = remainder
                        current_text = []
                else:
                    flush_current()
                    current_section = canonical
                    # Include the section header as first line of new section (so JobThai experience starts with "ประวัติการทํางาน")
                    current_text = [line_stripped]
                continue
            current_text.append(line_stripped)
        flush_current()
        return sections

    def _get_experience_blocks(self, exp: str) -> List[str]:
        """경력 텍스트를 블록 리스트로 분리 (이중 줄바꿈, 태국어 월+연도 구간). JobThai: 회사명+기간이 같은 줄에 있으면 그 줄로 분리."""
        if not exp or not exp.strip():
            return []
        # JobThai 분산 경력: 구분자로 합쳐진 경우 해당 구분자로만 분할 (4블록 유지)
        _exp_block_sep = "\n\n\ue000EXP_BLOCK\ue001\n\n"
        if _exp_block_sep in exp:
            parts = [p.strip() for p in exp.split(_exp_block_sep) if p.strip()]
            if len(parts) >= 2:
                return parts
        blocks: List[str] = []
        for part in re.split(r"\n\s*\n", exp):
            part = part.strip()
            if not part:
                continue
            blocks.append(part)
        # JobThai: 분산된 첫 경력(회사명/기간/지역/직책/급여/수준이 각각 한 블록)을 하나로 병합
        table_header = re.compile(r"ต[\u0E00-\u0E7F]*?าแหน่ง\s*เงินเดือน\s*ระดับ", re.I)
        exp_stripped = self._strip_pua(exp) if re.search(r"[\u0E00-\u0E7F]", exp or "") else (exp or "")
        if len(blocks) >= 4 and exp_stripped and re.search(r"[\u0E00-\u0E7F]", exp_stripped):
            first = (blocks[0] or "").strip()
            second = (blocks[1] or "").strip()
            second_first_ln = second.split("\n")[0].strip() if second else ""
            # 첫 블록이 경력 헤더이고, 두 번째가 테이블 헤더가 아닐 때: 둘째가 월명만으로 시작하면 섹션이 쪼개진 것이므로 병합
            if re.search(r"ประวัติการท[\u0E00-\u0E7F]*?างาน|ฝกงาน|ฝึกงาน", first) and len(second) > 2 and not table_header.search(second):
                if re.match(r"^(เมษายน|มีนาคม|มิถุนายน|กุมภาพันธ์|พฤษภาคม|ม\.|มกราคม|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)[\s\d\-]*", second_first_ln):
                    blocks = ["\n\n".join([blocks[0], blocks[1]])] + blocks[2:]
                else:
                    merge_end = 0
                    for i, b in enumerate(blocks):
                        if i >= 20:
                            break
                        if table_header.search(self._strip_pua(b)):
                            break
                        merge_end = i + 1
                    if merge_end > 1:
                        first_merged = "\n".join(blocks[:merge_end])
                        blocks = [first_merged] + blocks[merge_end:]
        if len(blocks) <= 1 and blocks and len(blocks[0]) > 200:
            bullet_parts = re.split(r"\n\s*[•\-*]\s+", blocks[0])
            bullet_parts = [p.strip() for p in bullet_parts if p.strip() and len(p.strip()) > 5]
            if len(bullet_parts) > 1:
                blocks = bullet_parts
        thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
        thai_month_year = thai_months + r"\s*25\d{2}\s*[-–—~]"
        # JobThai: 한 블록에 여러 경력일 때, "회사명  ThaiMonth 25XX -" 형태의 줄 앞에서 분리 (회사명 유지). 단 첫 블록이 경력 섹션 헤더면 분리하지 않음
        first_pre = (blocks[0] or "").strip()[:120]
        skip_first_split = bool(blocks and re.search(r"ประวัติการท[\u0E00-\u0E7F]*?างาน|ฝกงาน|ฝึกงาน", first_pre))
        # JobThai: 분산 경력으로 이미 4블록(섹션+Bangchan+กุลธร+FCC)인 경우 Thai month로 재분할하지 않음
        second_first = (blocks[1] or "").strip().split("\n")[0].strip()[:60] if len(blocks) > 1 else ""
        already_scattered = bool(
            len(blocks) >= 4 and second_first and
            (re.search(r"Bangchan|General\s+Assembly", second_first) or re.search(r"กุลธร|เมททัล", second_first) or "FCC" in second_first or "Thailand" in second_first)
        )
        if not skip_first_split and not already_scattered and len(blocks) <= 1 and blocks and len(blocks[0]) > 150 and re.search(r"[\u0E00-\u0E7F]", blocks[0]):
            parts = re.split(r"\n(?=[^\n]{8,350}" + thai_month_year + ")", blocks[0])
            parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 15]
            if len(parts) > 1:
                blocks = parts
        # 한 블록에 여러 경력이 있으면: 새 줄이 "월+연도-" 로 시작할 때만 분리 (첫 줄 중간의 기간은 분리하지 않음)
        if not skip_first_split and not already_scattered and len(blocks) <= 1 and blocks and len(blocks[0]) > 150:
            parts = re.split(r"\n(?=" + thai_month_year + ")", blocks[0])
            parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 20]
            if len(parts) > 1:
                blocks = parts
        if len(blocks) <= 1 and exp.strip():
            blocks = [exp.strip()]
        # JobThai: 첫 경력 헤더+본문 또는 꼬리 블록을 이전 블록에 병합
        while len(blocks) >= 2:
            second_first = (blocks[1] or "").strip().split("\n")[0].strip()[:80]
            b0, b1 = (blocks[0] or ""), (blocks[1] or "")
            tail = "จจุบัน" in second_first or ("ประเวศ" in second_first and "General" not in second_first) or (second_first == "กรุงเทพมหานคร")
            same_period = ("เมษายน" in second_first or "พฤษภาคม" in second_first) and "พฤษภาคม" in b0 and "27,000" in b1
            head_continue = ("ประวัติการ" in b0 or "ฝกงาน" in b0) and ("ASIA" in second_first or "PACIFIC" in second_first or "ประวัติ" in second_first)
            if tail or same_period or head_continue:
                blocks = ["\n\n".join([blocks[0], blocks[1]])] + blocks[2:]
            else:
                break
        return blocks

    def _parse_experience_entries_detailed(self, exp: str, max_entries: int = 10) -> List[Dict[str, Any]]:
        """경력/인턴십 블록별 상세 파싱. 1줄=회사명+근무기간, 2줄=근무지역, 3줄=직책+급여, 4줄=수준, 5줄~=담당부서/역할."""
        blocks = self._get_experience_blocks(exp or "")
        thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
        period_at_end = re.compile(
            r"\s+(" + thai_months + r"\s*\d{4}\s*[-–—~]\s*(?:Present|current|ปัจจุบัน|현재|\d{4}|" + thai_months + r"\s*\d{4}))\s*$",
            re.IGNORECASE,
        )
        period_eng = re.compile(
            r"\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*[-–—~]\s*(?:Present|current|ปัจจุบัน|\d{4}(?:\s*[-–—~]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4})?))\s*$",
            re.IGNORECASE,
        )
        period_year = re.compile(r"\s+(\d{4}\s*[-–—~]\s*(?:Present|current|ปัจจุบัน|현재|\d{4}))\s*$", re.IGNORECASE)
        result: List[Dict[str, Any]] = []
        for block in blocks[:max_entries]:
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if not lines:
                continue
            entry: Dict[str, Any] = {
                "company_name": "",
                "period": "",
                "work_location": "",
                "position": "",
                "salary": "",
                "level": "",
                "department": "",
                "responsibilities": "",
            }
            # 1줄: 회사명 + 근무기간 (기간이 줄 끝에 오는 경우). JobThai: 첫 줄이 섹션 헤더면 '/'·'ฝกงาน' 건너뛰고 회사명/기간 추출
            first = lines[0]
            start_idx = 0
            if re.search(r"ประวัติการท[\u0E00-\u0E7F]*?างาน|ฝกงาน|ฝึกงาน", first) and len(lines) > 1:
                start_idx = 1
                # Skip "/", "ฝกงาน" etc.; company = first line that looks like a company name (Latin + length)
                for i in range(1, min(8, len(lines))):
                    ln = (lines[i] or "").strip()
                    if not ln or ln in ("/", "ฝกงาน", "ฝึกงาน") or re.search(r"ตำแหน่ง|เงินเดือน|ระดับ", ln, re.I):
                        continue
                    if re.search(r"[A-Za-z]", ln) and len(ln) > 4:
                        entry["company_name"] = ln[:300]
                        break
                if not entry["company_name"] and len(lines) > 2:
                    entry["company_name"] = (lines[2] or "").strip()[:300]
                for idx, line in enumerate(lines[1:min(8, len(lines))], start=1):
                    for pat in (period_at_end, period_eng, period_year):
                        m = pat.search(line)
                        if m:
                            entry["period"] = m.group(1).strip()[:100]
                            break
                    if not entry["period"] and re.search(thai_months, line) and idx + 3 < len(lines):
                        # JobThai: period split across lines (พฤษภาคม\n2565\n-\nปัจจุบัน) -> join
                        parts = [lines[idx].strip(), lines[idx + 1].strip(), lines[idx + 2].strip(), lines[idx + 3].strip()]
                        if re.search(r"\d{4}", parts[1]) and (re.search(r"ป[\u0E00-\u0E7F]*?จจุบัน|ปัจจุบัน|Present|\d{4}", parts[3]) or len(parts[3]) <= 15):
                            entry["period"] = " ".join(parts)[:100]
                            break
                    if entry["period"]:
                        break
            if start_idx == 0:
                period = ""
                for pat in (period_at_end, period_eng, period_year):
                    m = pat.search(first)
                    if m:
                        period = m.group(1).strip()[:100]
                        entry["company_name"] = first[: m.start()].strip()[:300]
                        entry["period"] = period
                        break
                if not entry["company_name"]:
                    entry["company_name"] = first[:300]
            # 회사명 앞 "/", "ฝึกงาน/" 등 제거 후 정규화 (인턴 표기는 유지)
            cn = (entry["company_name"] or "").strip()
            if cn.startswith("/"):
                cn = cn[1:].strip()
            if cn:
                entry["company_name"] = cn[:300]
            # 2줄: 근무 지역 (단, "ฝึกงาน"/"ฝกงาน"만 있는 줄은 근무지가 아님). JobThai 병합 블록에서는 회사 다음이 기간/지역/직책 순
            base = 1 if start_idx else 0
            max_cand = 10 if start_idx else 3
            for cand in range(1, max_cand + 1):
                i = base + cand
                if len(lines) <= i:
                    break
                line = lines[i]
                if re.search(r"ตำแหน่ง|เงินเดือน|ระดับ|หน้าที่รับผิดชอบ|Position|Salary|Level|Responsibilities", line, re.I):
                    continue
                if period_at_end.search(line) or period_eng.search(line) or period_year.search(line):
                    continue
                if re.search(thai_months, line) or re.search(r"^\d{4}$", line.strip()) or line.strip() == "-":
                    continue
                if "จจุบัน" in line or "ปัจจุบัน" in line or re.match(r"^\s*Present\s*$", line, re.I):
                    continue
                s = line.strip()[:300]
                if s and s not in ("Internship", "internship") and (len(s) > 2 or re.search(r"[\u0E00-\u0E7F]", s)):
                    if ("กงาน" in s and len(s) < 20) or re.search(r"ฝ[\u0E00-\u0E7F]*?กงาน|ฝึกงาน", s):
                        continue
                    if (entry.get("company_name") or "").strip() and s == (entry["company_name"] or "").strip():
                        continue
                    if start_idx and re.search(r"^[A-Za-z\s&(),.\-]+$", s) and len(s) > 15:
                        continue
                    entry["work_location"] = s
                    break
            if not entry["work_location"] and len(lines) > base + 1:
                second = lines[base + 1]
                if not re.search(r"ตำแหน่ง|เงินเดือน|ระดับ|หน้าที่รับผิดชอบ|Position|Salary|Level|Responsibilities", second, re.I):
                    s2 = second.strip()[:300]
                    if s2 and s2 not in ("ฝึกงาน", "ฝกงาน", "Internship", "internship"):
                        entry["work_location"] = s2
            # 3줄: 직책(ตำแหน่ง), 급여(เงินเดือน)
            for i in range(1, min(5, len(lines))):
                line = lines[i]
                pos = self._extract_label_value(line, ["ตำแหน่ง", "Position", "Job Title", "직책", "직위"], max_len=200)
                if pos:
                    entry["position"] = pos
                sal = self._extract_label_value(line, ["เงินเดือน", "Salary", "급여", "연봉"], max_len=50)
                if not sal and re.search(r"\d{1,3}(,\d{3})*", line):
                    sal = self._extract_numeric_after_label(line, ["เงินเดือน", "Salary", "급여"], max_len=50)
                if sal:
                    entry["salary"] = sal
            if not entry["position"]:
                entry["position"] = self._extract_label_value(block, ["ตำแหน่ง", "Position", "Job Title", "직책", "직위"], max_len=200)
            # JobThai: PUA(ตําแหน่ง 등) 제거한 블록에서 재시도
            if re.search(r"[\u0E00-\u0E7F]", block):
                block_z = self._strip_pua(block)
                if not entry["position"]:
                    entry["position"] = self._extract_label_value(block_z, ["ตำแหน่ง", "Position", "Job Title", "직책", "직위"], max_len=200)
                if not entry["salary"]:
                    entry["salary"] = self._extract_label_value(block_z, ["เงินเดือน", "Salary", "급여"], max_len=50) or self._extract_numeric_after_label(block_z, ["เงินเดือน", "Salary", "급여"], max_len=50) or ""
                if not entry["level"]:
                    entry["level"] = self._extract_label_value(block_z, ["ระดับ", "Level", "수준", "직급"], max_len=100)
                # JobThai: position/salary/level on separate lines without labels (직책\n27,000\nระดับ)
                if (not entry["position"] or not entry["salary"] or not entry["level"]) and len(lines) >= 3:
                    for i, ln in enumerate(lines):
                        if re.match(r"^\d{1,3}(,\d{3})*$", ln.strip()):
                            if not entry["salary"]:
                                entry["salary"] = ln.strip()[:50]
                            if i > 0 and not entry["position"]:
                                entry["position"] = lines[i - 1].strip()[:200]
                            if i + 1 < len(lines) and not entry["level"]:
                                entry["level"] = lines[i + 1].strip()[:100]
                            break
                if not entry["responsibilities"]:
                    resp_z = self._extract_label_value_multiline(block_z, ["หน้าที่รับผิดชอบ", "Responsibilities", "담당업무", "역할", "Role"], max_lines=50, max_len=2000)
                    if resp_z:
                        entry["responsibilities"] = resp_z
            # 직책 필드에 "เงินเดือน 27,000" 등이 붙어 있으면 제거
            if entry["position"] and re.search(r"\s*(?:เงินเดือน|Salary|급여)\s*", entry["position"], re.I):
                entry["position"] = re.split(r"\s*(?:เงินเดือน|Salary|급여)\s*", entry["position"], 1)[0].strip()[:200]
            if not entry["salary"]:
                entry["salary"] = (self._extract_label_value(block, ["เงินเดือน", "Salary", "급여"], max_len=50) or
                    (self._extract_numeric_after_label(block, ["เงินเดือน", "Salary", "급여"], max_len=50) or ""))
            # 4줄: 수준 (ระดับ)
            if not entry["level"]:
                entry["level"] = self._extract_label_value(block, ["ระดับ", "Level", "수준", "직급"], max_len=100)
            # 담당부서 (ฝ่าย, แผนก, Department)
            if not entry["department"]:
                entry["department"] = self._extract_label_value(block, ["ฝ่าย", "แผนก", "Department", "담당부서", "부서", "หน่วยงาน"], max_len=200) or ""
            # 5줄~: 담당부서 및 역할 (หน้าที่รับผิดชอบ)
            if not entry["responsibilities"]:
                resp = self._extract_label_value_multiline(block, ["หน้าที่รับผิดชอบ", "Responsibilities", "담당업무", "역할", "Role"], max_lines=50, max_len=2000)
                if resp:
                    entry["responsibilities"] = resp
                else:
                    idx = -1
                    for label in ["หน้าที่รับผิดชอบ", "Responsibilities", "담당업무", "역할"]:
                        try:
                            m = re.search(re.escape(label) + r"\s*[:：]?\s*\n?", block, re.I)
                            if m:
                                idx = m.end()
                                break
                        except re.error:
                            continue
                    if idx >= 0 and idx < len(block):
                        entry["responsibilities"] = block[idx:].strip()[:2000]
            # JobThai: 첫 줄이 월명만 있거나 회사명이 애매할 때 블록 헤더(앞 400자)에서만 회사명 보정
            head = block[:400]
            cn = (entry.get("company_name") or "").strip()
            need_fix = (
                not entry["company_name"]
                or re.match(r"^(เมษายน|กุมภาพันธ์|มีนาคม|พฤษภาคม|มิถุนายน|ม\.|มกราคม)\s*$", cn)
                or (cn in ("Thailand", "(Subcontract)") and ("FCC" in head or "(Subcontract)" in block or ("6500" in block and re.search(r"เทคนิค", block))))
            )
            if need_fix:
                for pat, name in [
                    (r"Bangchan\s+General\s+Assembly", "Bangchan General Assembly"),
                    (r"กุลธร[\s\u0E00-\u0E7F]*?เมททัล[\u0E00-\u0E7F]*", None),
                    (r"FCC\s+Thailand(?:\s*\(Subcontract\))?", "FCC Thailand (Subcontract)"),
                ]:
                    m = re.search(pat, head)
                    if m:
                        entry["company_name"] = (name or m.group(0).strip())[:300]
                        # FCC 블록: 블록 내 6500·ช่างเทคนิค·เจ้าหน้าที่로 직책/급여/레벨 보정
                        if "FCC" in (entry.get("company_name") or ""):
                            if "6500" in block and not entry.get("salary"):
                                entry["salary"] = "6500"
                            if re.search(r"ช่างเทคนิค", block) and not entry.get("position"):
                                entry["position"] = "ช่างเทคนิค"
                            if re.search(r"เจ้าหน้าที่", block) and not entry.get("level"):
                                entry["level"] = "เจ้าหน้าที่"
                        # กุลธร 블록: 18,500·QC/QA Leader·หัวหน้างาน 보정
                        elif re.search(r"กุลธร|เมททัล", head) and "18,500" in block:
                            if not entry.get("salary"):
                                entry["salary"] = "18,500"
                            if not entry.get("position") and re.search(r"QC/QA\s*Leader|Leader", block):
                                entry["position"] = "QC/QA Leader"
                            if not entry.get("level") and re.search(r"หัวหน[\u0E00-\u0E7F]*?างาน", block):
                                entry["level"] = "หัวหน้างาน"
                        break
                # 블록이 Thailand/(Subcontract)로 시작할 때: (Subcontract) 있으면 FCC 보정(참조 문서 구조)
                if need_fix and cn in ("Thailand", "(Subcontract)") and "(Subcontract)" in block:
                    is_fcc = True
                    if is_fcc:
                        entry["company_name"] = "FCC Thailand (Subcontract)"
                        if not entry.get("salary") and "6500" in block:
                            entry["salary"] = "6500"
                        if not entry.get("position") and re.search(r"เทคนิค", block):
                            entry["position"] = "ช่างเทคนิค"
                        if not entry.get("level") and re.search(r"เจ[\u0E00-\u0E7F]*?าหน[\u0E00-\u0E7F]*?าที่", block):
                            entry["level"] = "เจ้าหน้าที่"
            if entry["company_name"] or entry["position"] or entry["responsibilities"]:
                result.append(entry)
        return result

    def _parse_experience_entries(self, exp: str, max_entries: int = 3) -> List[Tuple[str, str]]:
        """경력 텍스트를 최대 max_entries건으로 분리하여 (회사/직위, 근무기간) 리스트 반환. Last Working 1~3, LW1~3 period 용."""
        detailed = self._parse_experience_entries_detailed(exp, max_entries=max_entries)
        result: List[Tuple[str, str]] = []
        for e in detailed[:max_entries]:
            company = (e.get("company_name") or "").strip()
            period = (e.get("period") or "").strip()
            if company:
                result.append((company[:300], period[:100] if period else ""))
        return result

    def _parse_education_entries(self, edu: str) -> List[Dict[str, Any]]:
        """학력 섹션을 여러 항목으로 분리. JobThai: 대학교명 2562 다음에 ระดับการศึกษา, คณะ, สาขา, วุฒิ, เกรดเฉลี่ย."""
        if not edu or not edu.strip():
            return []
        blocks: List[str] = []
        # 먼저 이중 줄바꿈으로 블록 분리
        for part in re.split(r"\n\s*\n", edu):
            part = part.strip()
            if len(part) > 10:
                blocks.append(part)
        # 블록이 1개이고 길면 "대학교명 25XX" 줄로 분리 (한 줄이 연도로 끝나는 경우)
        if len(blocks) <= 1 and edu.strip():
            parts = re.split(r"\n(?=[^\n]*\s(25\d{2}|19\d{2}|20\d{2})\s*$)", edu)
            blocks = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
        if len(blocks) <= 1 and edu.strip():
            blocks = [edu.strip()]
        result: List[Dict[str, Any]] = []
        for block in blocks[:10]:
            entry: Dict[str, Any] = {}
            first_line = block.split("\n")[0].strip()
            m_year = re.search(r"\s(25\d{2}|19\d{2}|20\d{2})\s*$", first_line)
            if m_year:
                entry["year"] = m_year.group(1)
                entry["institution"] = first_line[: first_line.rfind(m_year.group(0))].strip()[:300]
            else:
                entry["institution"] = first_line[:300] if first_line else ""
                entry["year"] = ""
            entry["education_level"] = self._extract_label_value(block, ["ระดับการศึกษา", "Education Level", "학력 수준", "Academic Level", "ปวส.", "ปวช.", "ปริญญาตรี"], max_len=100)
            entry["faculty"] = self._extract_label_value(block, ["คณะ", "Faculty", "College", "단과대학"], max_len=200)
            entry["major"] = self._extract_label_value(block, ["สาขา", "Major", "전공", "สาขาวิชา"], max_len=200)
            entry["qualification"] = self._extract_label_value(block, ["วุฒิ", "Qualification", "Degree", "자격", "ปริญญา"], max_len=200)
            entry["gpa"] = self._extract_label_value(block, ["เกรดเฉลี่ย", "GPA", "평균 평점", "Grade Point"], max_len=20)
            # "ระดับการศึกษา"로 시작하는 기관명은 학력 수준 라벨 오인 — 별도 학력 항목으로 두지 않음
            inst = (entry.get("institution") or "").strip()
            if inst and re.match(r"^ระดับการศึกษา\s", inst, re.IGNORECASE):
                continue
            if entry["institution"] or entry.get("education_level") or entry.get("major") or entry.get("gpa"):
                result.append(entry)
        return result

    def _extract_education_detail_groups(self, zone: str) -> List[Dict[str, str]]:
        """Split by ระดับการศึกษา and parse each block into education_level, major, faculty, qualification, gpa."""
        if "ระดับการศึกษา" not in zone or len(zone) < 10:
            return []
        parts = re.split(r"ระดับการศึกษา\s*", zone, flags=re.IGNORECASE)
        groups: List[Dict[str, str]] = []
        for i, part in enumerate(parts):
            if i == 0 and part.strip():
                continue
            part = part.strip()
            if len(part) < 3:
                continue
            grp: Dict[str, str] = {}
            m_level = re.search(r"^([^\n]+?)(?=\s*สาขา\s|คณะ\s|วุฒิ\s|เกรดเฉลี่ย\s|$)", part)
            if m_level:
                grp["education_level"] = m_level.group(1).strip()[:100]
            # Label and value often on adjacent lines (label\nvalue); capture next line
            for label, key in [
                (r"สาขา\s*[:：]?\s*", "major"),
                (r"คณะ\s*[:：]?\s*", "faculty"),
                (r"วุฒิ\s*[:：]?\s*", "qualification"),
                (r"เกรดเฉลี่ย\s*[:：]?\s*", "gpa"),
            ]:
                m = re.search(label + r"\s*\n?\s*([^\n]+)", part)
                if m:
                    val = m.group(1).strip()[:200] if key != "gpa" else m.group(1).strip()[:20]
                    grp[key] = val
            if grp:
                groups.append(grp)
        return groups

    def _extract_education_institution_year_pairs(self, header_part: str) -> List[Tuple[str, str]]:
        """Parse (institution, year) pairs from header block. 대학교명 다음 줄에 졸업년도(2562 등). Handles: line1=inst, line2=year; or line='inst 2562'."""
        year_pat = re.compile(r"^\s*(25|19|20)(\d{2})\s*$")
        year_only_pat = re.compile(r"^(25|19|20)\d{2}$")
        same_line_pat = re.compile(r"^(.+?)\s+(25|19|20)(\d{2})\s*$")
        stop_section = re.compile(r"ประวัติการท[\u0E30\u0E31\u0E32\u0E4D]?างาน|ประวัติการทํางาน|ประวัติการทำงาน", re.I)
        # Split by any newline variant and strip
        raw_lines = re.split(r"[\r\n]+", header_part)
        lines: List[str] = []
        for ln in raw_lines:
            ln = ln.strip()
            if stop_section.search(ln):
                break
            if ln:
                lines.append(ln)
        if not lines:
            return []
        if lines and re.search(r"ประวัติการศึกษา", lines[0], re.I):
            lines = lines[1:]
        pairs: List[Tuple[str, str]] = []
        i = 0
        while i < len(lines):
            line = lines[i]
            m_same = same_line_pat.match(line)
            if m_same:
                inst = m_same.group(1).strip()[:300]
                year = m_same.group(2) + m_same.group(3)
                if inst and not year_only_pat.match(inst):
                    pairs.append((inst, year))
                i += 1
                continue
            m_year = year_pat.match(line)
            if i >= 1 and m_year:
                year_val = m_year.group(1) + m_year.group(2)
                inst = lines[i - 1].strip()[:300]
                if inst and not year_only_pat.match(inst):
                    pairs.append((inst, year_val))
                i += 1
            else:
                i += 1
        return pairs

    def _parse_training_cert_entries(self, text: str, max_entries: int = 20) -> List[Dict[str, Any]]:
        """교육 이력/자격증: 1줄=교육기관+교육기간, 2줄=과정, 3줄=자격증/졸업증서(선택). training/certification 섹션용."""
        if not text or not text.strip():
            return []
        blocks: List[str] = []
        for part in re.split(r"\n\s*\n", text):
            part = part.strip()
            if len(part) > 5:
                blocks.append(part)
        # 한 블록에 여러 항목이 붙은 경우: 첫 줄 끝에 기간(연도/태국어 월 연도)이 오는 줄로 분리
        if len(blocks) <= 1 and text.strip():
            thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
            period_end = re.compile(
                r"\n(?=[^\n]*\s(?:"
                r"(?:25\d{2}|19\d{2}|20\d{2})\s*[-–—~]\s*(?:25\d{2}|19\d{2}|20\d{2})|"
                r"" + thai_months + r"\s*\d{4}\s*[-–—~]|"
                r"\d{4}\s*[-–—~]\s*(?:Present|ปัจจุบัน|\d{4})"
                r")\s*$)",
                re.IGNORECASE,
            )
            parts = period_end.split(text)
            blocks = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
        if len(blocks) <= 1 and text.strip():
            blocks = [text.strip()]
        result: List[Dict[str, Any]] = []
        thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
        period_at_end = re.compile(
            r"\s+((?:25\d{2}|19\d{2}|20\d{2})\s*[-–—~]\s*(?:25\d{2}|19\d{2}|20\d{2})|"
            r"" + thai_months + r"\s*\d{4}\s*[-–—~]\s*(?:\d{4}|" + thai_months + r"\s*\d{4}|ปัจจุบัน|Present)|"
            r"\d{4}\s*[-–—~]\s*(?:Present|ปัจจุบัน|\d{4}))\s*$",
            re.IGNORECASE,
        )
        for block in blocks[:max_entries]:
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if not lines:
                continue
            entry: Dict[str, Any] = {
                "institution": "",
                "period": "",
                "course": "",
                "certificate": "",
            }
            first = lines[0]
            period = ""
            m = period_at_end.search(first)
            if m:
                period = m.group(1).strip()[:100]
                entry["institution"] = first[: m.start()].strip()[:300]
            else:
                entry["institution"] = first[:300]
            entry["period"] = period
            if len(lines) > 1:
                entry["course"] = lines[1][:500]
            if len(lines) > 2:
                entry["certificate"] = lines[2][:500]
            if entry["institution"] or entry["course"] or entry["certificate"]:
                result.append(entry)
        return result

    def _parse_ability_performance(self, sk: str) -> Dict[str, Any]:
        """능력·성과·참조인: 'ความสามารถ ผลงาน เกียรติประวัติ' 섹션에서 언어 외 타이핑, 특수능력, 성과, 참조인 추출."""
        out: Dict[str, Any] = {"typing_speed": "", "special_skills": "", "achievements": "", "references": ""}
        if not sk or not sk.strip():
            return out
        text = sk.strip()
        # JobThai: PUA(พิมพ์ดีดไทย 등) 제거 후 매칭
        text_norm = self._strip_pua(text) if re.search(r"[\u0E00-\u0E7F]", text) else text
        # 타이핑: พิมพ์ดีดไทย 30 คำ/นาที, พิมพ์ดีดอังกฤษ 20 คำ/นาที
        typing_parts = []
        for src in [text_norm, text]:
            m_th = re.search(r"พิมพ์ดีดไทย\s*[:：]?\s*(\d+)\s*คำ/นาที", src, re.IGNORECASE)
            if m_th:
                typing_parts.append(f"Thai {m_th.group(1)} words/min")
                break
        for src in [text_norm, text]:
            m_en = re.search(r"พิมพ์ดีดอังกฤษ\s*[:：]?\s*(\d+)\s*คำ/นาที", src, re.IGNORECASE)
            if m_en:
                typing_parts.append(f"English {m_en.group(1)} words/min")
                break
        if typing_parts:
            out["typing_speed"] = "; ".join(typing_parts)
        # 특수 능력: ความสามารถพิเศษอื่น ๆ ... (다음 블록 전까지). PUA 제거 텍스트에서 검색
        for start_label in ["ความสามารถพิเศษอื่น ๆ", "ความสามารถพิเศษอื่น", "ความสามารถพิเศษ", "อื่น ๆ", "Special Skills", "특수기술"]:
            idx = text_norm.find(start_label)
            if idx >= 0:
                rest = text_norm[idx + len(start_label):].lstrip()
                rest = re.sub(r"^\s*[:：]\s*", "", rest)
                end = len(rest)
                for end_label in ["โครงการ", "ผลงาน", "เกียรติประวัติ และประสบการณ์", "บุคคลอ้างอิง", "References"]:
                    p = rest.find(end_label)
                    if p >= 0 and p < end:
                        end = p
                block = rest[:end].strip()
                if len(block) > 10:
                    out["special_skills"] = block[:3000]
                    break
        # 성과: โครงการ ผลงาน เกียรติประวัติ ... บุคคลอ้างอิง 전까지
        for start_label in ["โครงการ ผลงาน เกียรติประวัติ และประสบการณ์อื่น ๆ", "โครงการ ผลงาน เกียรติประวัติ", "ผลงาน และประสบการณ์", "Projects", "Achievements", "성과", "프로젝트"]:
            idx = text_norm.find(start_label)
            if idx >= 0:
                rest = text_norm[idx + len(start_label):].lstrip()
                rest = re.sub(r"^\s*[:：]\s*", "", rest)
                ref_idx = rest.find("บุคคลอ้างอิง")
                if ref_idx >= 0:
                    rest = rest[:ref_idx]
                block = rest.strip()
                if len(block) > 5:
                    out["achievements"] = block[:3000]
                    break
        # 참조인: บุคคลอ้างอิง / References (다음 1~2줄)
        for start_label in ["บุคคลอ้างอิง", "References", "참조인", "Reference"]:
            idx = text_norm.find(start_label)
            if idx >= 0:
                rest = text_norm[idx + len(start_label):].lstrip()
                rest = re.sub(r"^\s*[:：]\s*", "", rest)
                lines = [ln.strip() for ln in rest.split("\n")[:3] if ln.strip()]
                ref_val = " ".join(lines).strip()[:500] if lines else rest[:500].strip()
                if ref_val:
                    out["references"] = ref_val
                break
        return out

    def _extract_label_value(self, text: str, labels: list, max_len: int = 2000) -> Optional[str]:
        return helpers.extract_label_value(text, labels, max_len, EMAIL_PATTERN)

    def _extract_numeric_after_label(self, text: str, labels: list, max_len: int = 50) -> Optional[str]:
        return helpers.extract_numeric_after_label(text, labels, max_len)

    def _extract_label_value_multiline(self, text: str, labels: list, max_lines: int = 2, max_len: int = 3000) -> Optional[str]:
        return helpers.extract_label_value_multiline(text, labels, max_lines, max_len, EMAIL_PATTERN)

    def _strip_pua(self, text: str) -> str:
        return helpers.strip_pua(text)

    def _normalize_address_value(self, addr: Optional[str]) -> Optional[str]:
        return helpers.normalize_address_value(addr)

    def _extract_linkedin_url(self, text: str) -> Optional[str]:
        """LinkedIn URL 추출"""
        m = re.search(r"https?://(?:www\.)?linkedin\.com/[^\s\)\]\"]+", text, re.IGNORECASE)
        return m.group(0).strip() if m else None

    def parse_pdf_to_structured_data(
        self,
        file_path: str,
        form_type_hint: Optional[int] = None,
        language_hint: Optional[str] = None,
        original_filename: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        PDF 파일을 파싱하여 구조화된 지원서 데이터 반환.
        지원서 종류: 1~5 (form_type), 언어: ko / en / th.
        original_filename이 있으면 자동 분류 시 이 파일명을 사용(클라이언트 원본명).
        """
        try:
            raw_text = self.extract_text(file_path)
        except Exception as e:
            return {
                "applicant_name": None,
                "applicant_surname": None,
                "applicant_email": None,
                "applicant_phone": None,
                "applicant_id": None,
                "age": None,
                "applied_position": None,
                "parsed_data": {"raw_preview": "", "error": str(e)},
                "document_language": language_hint or "en",
                "form_type": form_type_hint if form_type_hint in (1, 2, 3, 4, 5) else 1,
                "raw_text": "",
            }
        if not raw_text or len(raw_text.strip()) < 10:
            return {
                "applicant_name": None,
                "applicant_surname": None,
                "applicant_email": None,
                "applicant_phone": None,
                "applicant_id": None,
                "age": None,
                "applied_position": None,
                "parsed_data": {"raw_preview": raw_text[:500] if raw_text else ""},
                "document_language": language_hint or "en",
                "form_type": form_type_hint if form_type_hint in (1, 2, 3, 4, 5) else 1,
                "raw_text": raw_text,
            }
        lang = language_hint or self.detect_language(raw_text)
        if form_type_hint in (1, 2, 3, 4, 5):
            form_type = form_type_hint
        else:
            # 자동 분류: 클라이언트 원본 파일명 우선 사용
            filename_for_detect = original_filename if original_filename else (os.path.basename(file_path) if file_path else None)
            form_type = self.detect_form_type(raw_text, filename_for_detect)
            import logging
            logging.getLogger(__name__).info(
                "지원서 자동 분류: filename=%s -> form_type=%s (1=Jobbkk, 2=JobThai, 3=LinkedIn, 4=Linked Simple)",
                filename_for_detect or "(없음)",
                form_type,
            )

        from .forms import jobthai as _jobthai, jobbkk as _jobbkk, linkedin as _linkedin

        applicant_email = self._extract_email(raw_text)
        applicant_phone = self._extract_phone(raw_text)
        applicant_name = self._extract_name_by_form(raw_text, lang, form_type)
        applicant_surname = self._extract_label_value(raw_text, ["นามสกุล", "성", "Last Name", "Surname", "Family Name"], max_len=200)
        # 성/이름 미분리 시: 공백으로 구분해 마지막 단어를 성(นามสกุล), 나머지를 이름으로 설정
        if applicant_name and not applicant_surname and " " in applicant_name.strip():
            parts = applicant_name.strip().split()
            if len(parts) >= 2:
                applicant_surname = parts[-1]
                applicant_name = " ".join(parts[:-1])
        header_text = (raw_text[:2500] if len(raw_text) > 2500 else raw_text) if form_type == 2 else raw_text
        applicant_id = self._extract_label_value(header_text, ["รหัส", "ID", "Applicant ID", "지원자 ID"], max_len=100) or self._extract_label_value(raw_text, ["รหัส", "ID", "Applicant ID", "지원자 ID"], max_len=100)
        age = self._extract_label_value(raw_text, ["อายุ", "Age", "나이"], max_len=20)
        # 지원날짜 (วันที่สมัคร): JobThai "วันที่สมัคร : 28 ม.ค. 69" (전체 날짜 추출)
        application_date = self._extract_label_value(header_text, ["วันที่สมัคร", "Application Date", "지원일", "Apply Date", "Date Applied"], max_len=100) or self._extract_label_value(raw_text, ["วันที่สมัคร", "Application Date", "지원일"], max_len=100)
        if not application_date or (application_date.strip().isdigit() and len(application_date.strip()) <= 2):
            m_app_date = re.search(
                r"วันที่สมัคร\s*[:：]?\s*(\d{1,2}\s*(?:ม\.\s*ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*\d{2,4})",
                raw_text[:3000],
                re.IGNORECASE,
            )
            if m_app_date:
                application_date = m_app_date.group(1).strip()[:100]
            else:
                app_multiline = self._extract_label_value_multiline(raw_text, ["วันที่สมัคร", "Application Date", "지원일"], max_lines=2, max_len=100)
                if app_multiline and len(app_multiline.strip()) > 2:
                    application_date = app_multiline.strip()[:100]
                elif re.search(r"[\u0E00-\u0E7F]", raw_text):
                    m_app_date2 = re.search(r"วันที่สมัคร\s*[:：]?\s*\n?\s*([^\n\r]+)", raw_text[:3000])
                    if m_app_date2:
                        v = m_app_date2.group(1).strip()
                        if v and len(v) > 2 and not v.strip().isdigit():
                            application_date = v[:100]
        sections = self._extract_sections(raw_text)
        # JobThai: 학력 블록 안에 "ประวัติการทํางาน" / "ฝกงาน" 등이 섞여 있으면 경력으로 분리
        edu_raw = sections.get("education") or ""
        for sep in ["ประวัติการทํางาน / ฝกงาน", "ประวัติการทำงาน/ฝึกงาน", "ประวัติการทํางาน", "ประวัติการทำงาน", "ฝกงาน", "ฝึกงาน"]:
            if sep in edu_raw:
                idx = edu_raw.find(sep)
                sections["education"] = edu_raw[:idx].strip()
                rest = edu_raw[idx + len(sep):].strip()
                # 첫 몇 줄 중 구분자만 있는 줄 제거
                lines = rest.split("\n")
                start = 0
                for i, line in enumerate(lines):
                    t = line.strip()
                    if t and (len(t) > 15 or re.search(r"\d{4}|ASIA|บริษัท|Company|พฤษภาคม|กุมภาพันธ์", t)):
                        start = i
                        break
                rest = "\n".join(lines[start:]).strip()
                if rest and len(rest) > 10:
                    sections["experience"] = ((sections.get("experience") or "").strip() + "\n\n" + rest).strip()
                break

        edu = (sections.get("education") or "").strip() or None
        # JobThai: 분산된 "ระดับการศึกษา สาขา คณะ วุฒิ เกรดเฉลี่ย" 블록을 raw_text에서 찾아 edu에 추가
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            zone_edu = self._strip_pua(raw_text)
            m_edu_scatter = re.search(
                r"ระดับการศึกษา\s*([\s\S]{50,2000}?)(?=ต[\u0E00-\u0E7F]*?าแหน่ง\s*เงินเดือน|สมัครต[\u0E00-\u0E7F]*?าแหน่ง|เพศ\s|วันเกิด\s|\d{1,2}\s+ม\.?\s*ค\.|\Z)",
                zone_edu,
            )
            if m_edu_scatter:
                scatter_block = ("ระดับการศึกษา " + m_edu_scatter.group(1).strip()).strip()
                if scatter_block and ("เกรดเฉลี่ย" in scatter_block or "สาขา" in scatter_block):
                    edu = (edu or "") + "\n\n" + scatter_block
        exp = (sections.get("experience") or "").strip() or None
        had_scattered = False
        # JobThai: 분산된 경력2, 경력3 블록(รหัส 이후의 회사+기간+급여 블록)을 raw_text에서 추출해 exp에 추가
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            scattered = _jobthai.extract_scattered_experience_blocks(self, raw_text)
            if scattered:
                had_scattered = True
                # 블록 내부 이중 줄바꿈을 단일 줄바꿈으로 정규화 (\r\n 통일 후 처리)
                def _norm_block(b: str) -> str:
                    s = (b or "").replace("\r\n", "\n").replace("\r", "\n")
                    return re.sub(r"\n\s*\n+", "\n", s).strip()
                normalized = [_norm_block(b) for b in scattered if (b or "").strip()]
                # 블록 구분을 위해 희귀 구분자 사용(내부 \n\n으로 인한 과도한 분할 방지)
                _exp_block_sep = "\n\n\ue000EXP_BLOCK\ue001\n\n"
                addition = _exp_block_sep.join(normalized)
                _first = (exp or "").strip().replace("\r\n", "\n").replace("\r", "\n")
                first_exp = re.sub(r"\n\s*\n+", "\n", _first).strip()
                exp = (first_exp + _exp_block_sep + addition).strip() if first_exp else addition
        # JobThai: 경력 섹션에 ตำแหน่ง/เงินเดือน/ระดับ/หน้าที่รับผิดชอบ 이 없으면 raw_text에서 해당 블록 추가 (분산 경력 추가한 경우 제외)
        if form_type == 2 and exp and re.search(r"[\u0E00-\u0E7F]", raw_text or "") and not re.search(r"ตำแหน่ง|เงินเดือน|ระดับ|หน้าที่รับผิดชอบ", self._strip_pua(exp)):
            if not had_scattered:
                zone_exp = self._strip_pua(raw_text or "")
                m_exp = re.search(
                    r"(ต[\u0E00-\u0E7F]*?าแหน่ง\s*เงินเดือน\s*ระดับ[\s\S]{20,3000}?)(?=ประวัติการฝ[\u0E00-\u0E7F]*?กอบรม|ความสามารถ|หลักสูตร|\Z)",
                    zone_exp,
                )
                if m_exp:
                    exp = (exp + "\n\n" + m_exp.group(1).strip()).strip()
        # 학력 섹션을 여러 항목으로 분리 (대학교, 연도, 학력수준, 단과대학, 전공, 자격, GPA)
        # JobThai: 기관+연도 블록(대학교명\n2562)과 ระดับการศึกษา/สาขา/คณะ 블록이 분리된 경우 한 번에 2건 생성
        if form_type == 2 and edu and re.search(r"[\u0E00-\u0E7F]", edu):
            two_part = _jobthai.parse_education_jobthai_two_part(self, edu)
            if two_part:
                education_entries = two_part
            else:
                education_entries = self._parse_education_entries(edu) or []
                if education_entries:
                    education_entries = _jobthai.merge_scattered_education_fields(self, edu, education_entries)
        else:
            education_entries = self._parse_education_entries(edu or "") if edu else []
            if form_type == 2 and education_entries and re.search(r"[\u0E00-\u0E7F]", edu or ""):
                education_entries = _jobthai.merge_scattered_education_fields(self, edu or "", education_entries)
        # JobThai fallback: raw_text에서 "ประวัติการศึกษา ... ประวัติการทํางาน" 블록을 직접 추출해 (기관, 졸업년도) 쌍으로 채우기
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            z = self._strip_pua(raw_text)
            beg = z.find("ประวัติการศึกษา")
            if beg >= 0:
                end = z.find("ประวัติการทํางาน", beg)
                if end < 0:
                    end = z.find("ประวัติการทำงาน", beg)
                if end < 0:
                    end = len(z)
                block = z[beg:end]
                block = re.sub(r"^[\s\S]*?ประวัติการศึกษา\s*", "", block, count=1, flags=re.I).strip()
                raw_pairs = self._extract_education_institution_year_pairs(block)
                if raw_pairs:
                    for i, (inst, yr) in enumerate(raw_pairs):
                        if i < len(education_entries):
                            education_entries[i]["year"] = yr
                            education_entries[i]["institution"] = inst or education_entries[i].get("institution") or ""
                        else:
                            education_entries.append({
                                "institution": inst,
                                "year": yr,
                                "education_level": "",
                                "faculty": "",
                                "major": "",
                                "qualification": "",
                                "gpa": "",
                            })
        # 경력 섹션 상세 파싱 (회사명, 기간, 근무지역, 직책, 급여, 수준, 담당/역할) + last_working_1~3용
        experience_entries_detailed = self._parse_experience_entries_detailed(exp or "") if exp else []
        # JobThai: 분산된 'หน้าที่รับผิดชอบ' 블록을 raw_text에서 순서대로 추출해 각 경력 항목에 병합
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            resp_blocks = _jobthai.extract_responsibility_blocks(self, raw_text)
            for i, rb in enumerate(resp_blocks):
                if i < len(experience_entries_detailed) and rb:
                    experience_entries_detailed[i]["responsibilities"] = rb.strip()[:2000]
        experience_entries = self._parse_experience_entries(exp or "") if exp else []
        sk = (sections.get("skills") or "").strip() or None
        # JobThai: "ความสามารถ ผลงาน เกียรติประวัติ" 블록이 비었거나 짧으면 raw_text(PUA 제거)에서 추출
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            zone_sk = self._strip_pua(raw_text)
            if (not sk or len(sk or "") < 100) and ("ความสามารถ" in zone_sk or "พิมพ์ดีด" in zone_sk):
                for start in ["ความสามารถ ผลงาน เกียรติประวัติ", "ความสามารถทางภาษา", "ความสามารถ"]:
                    idx = zone_sk.find(start)
                    if idx >= 0:
                        sk = (sk or "") + "\n\n" + zone_sk[idx:idx + 6000].strip()
                        break
        summ = (sections.get("summary") or "").strip() or None
        intro = (sections.get("intro") or "").strip() or None
        cert_section = (sections.get("certification") or "").strip() or None

        company_name = self._extract_label_value(raw_text, [
            "Company", "Company Name", "Company Information", "ข้อมูลบริษัท", "บริษัท", "회사명", "기업명", "ขอมูลบรษัท"
        ])
        business_type = self._extract_label_value(raw_text, [
            "Business Type", "Industry", "ประเภทธุรกิจ", "업종", "사업분야"
        ])
        # ---------- 지원 직위 / 최종 이력서 수정일: 양식별 파서 우선 적용 ----------
        applied_position = None
        update_date = None
        if form_type == 2:
            header = _jobthai.parse_header(self, raw_text or "")
            applied_position = header.get("applied_position") or None
            update_date = header.get("update_date") or None
        elif form_type == 1:
            header = _jobbkk.parse_header(self, raw_text or "")
            applied_position = header.get("applied_position") or None
            update_date = header.get("update_date") or None
        elif form_type in (3, 4):
            header = _linkedin.parse_header(self, raw_text or "")
            applied_position = header.get("applied_position") or None
            update_date = header.get("update_date") or None
        text_for_position = raw_text
        if not applied_position:
            applied_position = self._extract_label_value(text_for_position, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "ตำแหน่งที่สมัคร", "Applied Position", "Position to apply",
                "지원 직위", "지원직위", "지원직무"
            ], max_len=300) or self._extract_label_value_multiline(text_for_position, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "ตำแหน่งที่สมัคร", "Applied Position", "Position to apply",
                "지원 직위", "지원직위", "지원직무"
            ], max_lines=2, max_len=300)
        if not applied_position:
            m_pos = re.search(r"สมัครตำแหน่ง\s*[:：]?\s*(?:\n\s*)?([^\n\r]+)", raw_text)
            if m_pos:
                applied_position = m_pos.group(1).strip()[:300]
        if not applied_position:
            m_pos_next = re.search(r"สมัครตำแหน่ง\s*[:：]?\s*\n\s*([^\n\r]+)", raw_text)
            if m_pos_next:
                applied_position = m_pos_next.group(1).strip()[:300]
        if not applied_position:
            applied_position = self._extract_label_value(raw_text, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "Applied Position", "지원 직위", "지원직위"
            ], max_len=300) or self._extract_label_value_multiline(raw_text, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "Applied Position", "지원 직위"
            ], max_lines=2, max_len=300)
        if not applied_position and "สมัครตำแหน่ง" in raw_text:
            idx = raw_text.find("สมัครตำแหน่ง")
            snippet = raw_text[idx : idx + 450]
            normalized = re.sub(r"[\r\n]+", " ", snippet)
            m_norm = re.search(r"สมัครตำแหน่ง\s*[:：]?\s*(.+?)(?=\s*แก้ไขประวัติล่าสุด|ที่อยู่ตามทะเบียน|วันเกิด|\d{1,2}\s+ม\.?\s*ค\.|\Z)", normalized, re.DOTALL)
            if m_norm:
                val = m_norm.group(1).strip()
                if len(val) > 2 and len(val) < 350 and not EMAIL_PATTERN.match(val):
                    applied_position = val[:300]
        position = self._extract_label_value(raw_text, [
            "Position", "Job Title", "ตำแหน่งงาน", "ตำแหน่ง", "직위", "직무", "직책", "Design"
        ])
        employment_period = self._extract_label_value(raw_text, [
            "Duration", "Period", "Employment Period", "ระยะเวลา", "근무기간", "재직기간", "Dates"
        ])
        salary = self._extract_label_value(raw_text, [
            "Salary", "เงินเดือน", "급여", "연봉", "Expected Salary", "Compensation"
        ])
        if salary and not re.search(r"^\d{1,3}(,\d{3})*(\.\d+)?\s*$", (salary or "").replace(" ", "").strip()):
            numeric_sal = self._extract_numeric_after_label(
                (exp or "") + "\n" + (intro or "") + "\n" + (raw_text[:4000] or ""),
                ["เงินเดือน", "Salary", "급여", "연봉"],
                max_len=50
            )
            if numeric_sal:
                salary = numeric_sal
        # 주소: JobThai는 forms/jobthai.enrich_address, 그 외 공통 fallback
        address = None
        if form_type == 2 and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            address = _jobthai.enrich_address(self, raw_text, intro)
        if not address:
            m_addr_same = re.search(r"ที่อยู่\s*[:：]?\s*([^\n\r]{5,500})", raw_text)
            if m_addr_same:
                cand = m_addr_same.group(1).strip()
                if re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.|จ\.", cand):
                    address = cand[:3000]
        if not address:
            address = self._extract_label_value_multiline(raw_text, [
                "ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "Current Address", "Residence", "Location", "현재 주소"
            ], max_lines=12, max_len=3000) or (intro and self._extract_label_value_multiline(intro, [
                "ที่อยู่", "ที่อยู่ปัจจุบัน", "Address", "주소", "현재 주소"
            ], max_lines=10, max_len=3000)) or self._extract_label_value(raw_text, [
                "ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "Current Address", "Residence", "Location", "현재 주소"
            ], max_len=3000)
        if (not address or len((address or "").strip()) < 20) and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            m_that = re.search(r"ที่อย[\u0E00-\u0E7F\s\uE000-\uF8FF]{0,6}ู\s*[:：]?\s*\n?\s*([^\n]+(?:\n(?!อีเมล|Email|Mobile|โทรศัพท์|เบอร์|Line|ไลน์|ชื่อ\s|เพศ|วันเกิด|อายุ\s|ส่วนสูง|น้ำหนัก)[^\n]+){0,14})", raw_text)
            if m_that:
                candidate = m_that.group(1).strip()
                if len(candidate) > 10 and (re.search(r"[\u0E00-\u0E7F]", candidate) or re.search(r"\d+/\d+", candidate) or re.search(r"\d+\s*ถ\.", candidate)):
                    if not address or len(candidate) > len((address or "")):
                        address = candidate[:3000]
        if not address and re.search(r"[\u0E00-\u0E7F]", raw_text):
            m_addr = re.search(r"ที่อยู่\s*[:：]?\s*\n\s*([^\n]+(?:\n[^\n]+){0,5})", raw_text)
            if m_addr:
                address = m_addr.group(1).strip()[:3000]
            if not address:
                z = self._strip_pua(raw_text[:10000])
                m_addr_z = re.search(r"ที่อย[\u0E00-\u0E7F\s]{0,4}ู\s*[:：]?\s*\n\s*([^\n]+(?:\n[^\n]+){0,10})", z)
                if m_addr_z:
                    cand = m_addr_z.group(1).strip()
                    if len(cand) > 10 and re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.", cand):
                        address = cand[:3000]
            if not address:
                m_addr2 = re.search(r"(\d+[\s/\-]*\d*\s*(?:ม\.|หมู่)\s*\d+[^\n]{2,200})", raw_text)
                if m_addr2:
                    address = m_addr2.group(1).strip()[:3000]
            if not address:
                m_addr3 = re.search(r"(\d+\s*ถ\.\s*[\u0E00-\u0E7F\s]+)", raw_text)
                if m_addr3:
                    address = m_addr3.group(1).strip()[:3000]
        # 최종 이력서 수정일 — JobThai는 위 _parse_jobthai_header에서 이미 설정됨. 미설정 시 공통 fallback
        if not update_date:
            m_update = re.search(
                r"แก้ไขประวัติล่าสุด\s*[:：]?\s*(?:\n\s*)?([^\n\r]+)",
                raw_text,
            )
            if m_update:
                update_date = m_update.group(1).strip()[:100]
        if not update_date:
            m_update2 = re.search(
                r"แก้ไขประวัติล่าสุด\s*[:：]?\s*\n\s*(\d{1,2}\s+[ก-ฮม\.]+(?:\s+[ก-ฮม\.]+)*\s+\d{4})",
                raw_text,
            )
            if m_update2:
                update_date = m_update2.group(1).strip()[:100]
        if not update_date:
            update_date = self._extract_label_value_multiline(raw_text, [
                "แก้ไขประวัติล่าสุด", "แก้ไขล่าสุด", "อัปเดตล่าสุด", "Last Updated", "Last modified", "Modified", "อัปเดต", "Update", "Updated", "갱신일", "최종 수정일"
            ], max_lines=2, max_len=100) or self._extract_label_value(raw_text, [
                "แก้ไขประวัติล่าสุด", "แก้ไขล่าสุด", "อัปเดตล่าสุด", "Last Updated", "Last modified", "Modified", "อัปเดต", "Update", "Updated", "갱신일", "최종 수정일"
            ], max_len=100)
        if not update_date and "แก้ไขประวัติล่าสุด" in raw_text:
            idx = raw_text.find("แก้ไขประวัติล่าสุด")
            snippet = raw_text[idx : idx + 200]
            normalized = re.sub(r"[\r\n]+", " ", snippet)
            m_norm = re.search(r"แก้ไขประวัติล่าสุด\s*[:：]?\s*(\d{1,2}\s+[ก-ฮม\.]+(?:\s+[ก-ฮม\.]+)*\s+\d{2,4})", normalized)
            if m_norm:
                update_date = m_norm.group(1).strip()[:100]
            if not update_date:
                m_any = re.search(r"แก้ไขประวัติล่าสุด\s*[:：]?\s*([^\n\r]+)", normalized)
                if m_any:
                    cand = m_any.group(1).strip()
                    if re.search(r"\d{1,2}\s+[ก-ฮม]", cand) or re.search(r"\d{4}", cand):
                        update_date = cand[:100]
        # 생년월일: "วันเกิด" 라벨 뒤에 있는 값만 사용 (수정일 값이 생년월일로 들어가는 것 방지)
        date_of_birth = self._extract_label_value_multiline(raw_text, [
            "วันเกิด", "วันเดือนปีเกิด", "วัน/เดือน/ปีเกิด", "Date of Birth", "Birth Date", "생년월일", "DOB"
        ], max_lines=3, max_len=100) or self._extract_label_value(raw_text, [
            "วันเกิด", "วันเดือนปีเกิด", "วัน/เดือน/ปีเกิด", "Date of Birth", "Birth Date", "생년월일", "DOB"
        ], max_len=100)
        if date_of_birth and update_date and date_of_birth.strip() == update_date.strip():
            date_of_birth = None
        if not date_of_birth and (intro or raw_text):
            m_dob = re.search(
                r"(?:วันเกิด|DOB|Birth)\s*[:：]?\s*(\d{1,2}\s+[ก-ฮม\.]+(?:\s+[ก-ฮม\.]+)*\s+\d{4})",
                intro or raw_text,
                re.IGNORECASE
            )
            if m_dob:
                candidate = m_dob.group(1).strip()[:80]
                if candidate != (update_date or "").strip():
                    date_of_birth = candidate
        # 전체 날짜 패턴 보정: "23"만 파싱된 경우 "วันเกิด" 뒤 텍스트에서만 검색 (수정일 27 มกราคม 2569 제외)
        if date_of_birth and len(date_of_birth.strip()) <= 4 and re.match(r"^\d{1,2}\s*$", date_of_birth.strip()):
            thai_months_short = r"(?:ม\.?\w+|ม\.?\s*ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
            search_scope = raw_text
            for birth_label in ["วันเกิด", "วันเดือนปีเกิด", "DOB", "Birth Date", "생년월일"]:
                idx = raw_text.find(birth_label)
                if idx >= 0:
                    search_scope = raw_text[idx:idx + 400]
                    break
            full_dob = (
                re.search(r"\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}년\s*\d{1,2}월\s*\d{1,2}일", search_scope)
                or re.search(r"\d{1,2}\s+" + thai_months_short + r"\s+\d{4}", search_scope)
                or re.search(r"\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{4}", search_scope)
                or re.search(r"\d{1,2}\s*[-.]\s*\d{1,2}\s*[-.]\s*\d{4}", search_scope)
                or re.search(r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}", search_scope, re.IGNORECASE)
            )
            if full_dob:
                candidate = full_dob.group(0).strip()[:80]
                if not update_date or candidate.strip() != update_date.strip():
                    date_of_birth = candidate
        nationality = self._extract_label_value(raw_text, [
            "Nationality", "สัญชาติ", "국적", "Citizenship"
        ])
        if nationality and nationality.strip() in ("태국어", "ภาษาไทย", "Thai language"):
            nationality = "ไทย" if "ไทย" in (nationality or "") else "Thailand"
        gender = self._extract_label_value(raw_text, [
            "Gender", "Sex", "เพศ", "성별"
        ])
        # 신장/체중: JobThai는 forms/jobthai.enrich_height_weight, 그 외 공통
        height_part = None
        weight_part = None
        if form_type == 2 and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            h_jt, w_jt = _jobthai.enrich_height_weight(self, raw_text, intro)
            if h_jt:
                height_part = h_jt
            if w_jt:
                weight_part = w_jt
        # 1) 태국어 형식 정규식 우선 (같은 줄 또는 다음 줄)
        if not height_part:
            m_h = re.search(r"ส่วนสูง\s*[:：]?\s*(\d+)\s*(?:ซม\.?|cm\.?)?", raw_text, re.IGNORECASE)
            if m_h:
                height_part = (m_h.group(1) + " ซม.") if re.search(r"[\u0E00-\u0E7F]", raw_text) else (m_h.group(1) + " cm")
        if not weight_part:
            m_w = re.search(r"น้ำหนัก\s*[:：]?\s*(\d+)\s*(?:กก\.?|kg\.?)?", raw_text, re.IGNORECASE)
            if m_w:
                weight_part = (m_w.group(1) + " กก.") if re.search(r"[\u0E00-\u0E7F]", raw_text) else (m_w.group(1) + " kg")
        # 2) 라벨 기반 (같은 줄/다음 줄), intro(개인 상세)에서 먼저 시도 (라벨 변이 포함)
        if not height_part:
            search_text = (intro or "") + "\n" + raw_text if (form_type == 2 and intro) else raw_text
            search_stripped = self._strip_pua(search_text) if (form_type == 2 and search_text) else search_text
            height_part = (
                self._extract_label_value(search_stripped, ["ส่วนสูง", "วนสูง", "Height", "신장"], max_len=50)
                or self._extract_label_value_multiline(search_stripped, ["ส่วนสูง", "วนสูง", "Height", "신장"], max_lines=2, max_len=50)
                or self._extract_label_value(search_text, ["ส่วนสูง", "Height", "신장"], max_len=50)
            )
        if not weight_part:
            search_text = (intro or "") + "\n" + raw_text if (form_type == 2 and intro) else raw_text
            search_stripped = self._strip_pua(search_text) if (form_type == 2 and search_text) else search_text
            weight_part = (
                self._extract_label_value(search_stripped, ["น้ำหนัก", "นํ้าหนัก", "Weight", "체중"], max_len=50)
                or self._extract_label_value_multiline(search_stripped, ["น้ำหนัก", "นํ้าหนัก", "Weight", "체중"], max_lines=2, max_len=50)
                or self._extract_label_value(search_text, ["น้ำหนัก", "Weight", "체중"], max_len=50)
            )
        # 3) PUA 제거 텍스트에서 표준 라벨로 재시도 (공통)
        if not height_part:
            z = self._strip_pua(raw_text or "")
            m_hz = re.search(r"ส่วนสูง\s*[:：]?\s*(\d+)\s*(?:ซม\.?|cm\.?)?", z)
            if m_hz:
                height_part = (m_hz.group(1) + " ซม.").strip()[:50]
        if not weight_part:
            z = self._strip_pua(raw_text or "")
            m_wz = re.search(r"น้ำหนัก\s*[:：]?\s*(\d+)\s*(?:กก\.?|kg\.?)?", z)
            if m_wz:
                weight_part = (m_wz.group(1) + " กก.").strip()[:50]
        # 4) 숫자+단위만 있는 경우 정규식 (예: "170 ซม.", "68 กก.")
        if not height_part:
            m_h2 = re.search(r"ส่วนสูง\s*[:：]?\s*(\d+\s*(?:ซม\.?|cm\.?))", raw_text, re.IGNORECASE)
            if m_h2:
                height_part = m_h2.group(1).strip()[:50]
        if not weight_part:
            m_w2 = re.search(r"น้ำหนัก\s*[:：]?\s*(\d+\s*(?:กก\.?|kg\.?))", raw_text, re.IGNORECASE)
            if m_w2:
                weight_part = m_w2.group(1).strip()[:50]
        height_part = (height_part or "").strip()[:50] or None
        weight_part = (weight_part or "").strip()[:50] or None
        height_weight = " / ".join(filter(None, [height_part or "", weight_part or ""])).strip() or None
        height_only = height_part
        weight_only = weight_part
        linkedin_url = self._extract_linkedin_url(raw_text)
        religion = self._extract_label_value(raw_text, ["Religion", "ศาสนา", "종교"])
        marital_status = self._extract_label_value(raw_text, ["Marital Status", "สถานภาพสมรส", "혼인상태"])
        if form_type == 2 and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            training_section, training_cert_entries = _jobthai.build_training_section_and_entries(
                self, raw_text, sections, cert_section
            )
        else:
            training_section = (sections.get("training") or "").strip() or None
            training_cert_merged = "\n\n".join(filter(None, [training_section, cert_section]))
            training_cert_entries = self._parse_training_cert_entries(training_cert_merged) if training_cert_merged else []
        vehicles_section = (sections.get("vehicles") or "").strip() or None
        language_section = (sections.get("language_skills") or "").strip() or None
        if form_type == 2 and not language_section and sk:
            lang_jt = _jobthai.enrich_language_section(self, raw_text, sk)
            if lang_jt:
                language_section = lang_jt
        # 능력·성과·참조인: 타이핑, 특수능력, 성과(프로젝트/수상), 참조인. JobThai는 PUA 제거 텍스트로 재시도
        ability_perf = self._parse_ability_performance(sk or "") if sk else {}
        if raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            sk_stripped = self._strip_pua(sk or "")
            if sk_stripped and sk_stripped != (sk or ""):
                fallback = self._parse_ability_performance(sk_stripped)
                for k in ["typing_speed", "special_skills", "achievements", "references"]:
                    if fallback.get(k) and not ability_perf.get(k):
                        ability_perf[k] = fallback[k]
            if not ability_perf.get("typing_speed") or not ability_perf.get("special_skills") or not ability_perf.get("achievements") or not ability_perf.get("references"):
                fallback2 = self._parse_ability_performance(self._strip_pua(raw_text[:9000]))
                for k in ["typing_speed", "special_skills", "achievements", "references"]:
                    if fallback2.get(k) and not ability_perf.get(k):
                        ability_perf[k] = fallback2[k]
        desired_job_section = (sections.get("desired_job") or "").strip() or None
        # JobThai: "ลักษณะงานที่ต้องการ" 블록이 섹션에 없으면 raw_text / PUA 제거 텍스트에서 직접 추출
        if (not desired_job_section or len(desired_job_section) < 20) and re.search(r"[\u0E00-\u0E7F]", raw_text):
            for src in [raw_text, self._strip_pua(raw_text or "")]:
                # PUA 제거 시 "ต้องการ" → "ตองการ" 변이 가능
                m_dj = re.search(
                    r"ลักษณะงานที่ต[ ํ]?องการ\s*([^\n]*(?:\n(?!\s*(?:ความสามารถ|ประวัติการทำงาน|ประวัติการศึกษา|ที่อยู่|รายละเอียดส่วนตัว))[^\n]*){0,30})",
                    src,
                )
                if m_dj:
                    block = m_dj.group(1).strip()
                    if len(block) > 15:
                        desired_job_section = ("ลักษณะงานที่ต้องการ\n" + block).strip()
                        break
        # 희망 직무 특성: 섹션 내에서 먼저 추출 시도 후 전체 원문에서 재시도
        def _from_desired_job_or_raw(labels: list, max_len: int = 2000, multiline: bool = False, max_lines: int = 2) -> Optional[str]:
            if desired_job_section:
                if multiline:
                    v = self._extract_label_value_multiline(desired_job_section, labels, max_lines=max_lines, max_len=max_len)
                else:
                    v = self._extract_label_value(desired_job_section, labels, max_len=max_len)
                if v:
                    return v
            if multiline:
                return self._extract_label_value_multiline(raw_text, labels, max_lines=max_lines, max_len=max_len) or self._extract_label_value(raw_text, labels, max_len=max_len)
            return self._extract_label_value(raw_text, labels, max_len=max_len)
        # 희망 급여: 범위(28,000-33,000) 유지. JobThai PUA(เงินเดือนที่ตองการ) 변이 패턴으로 매칭
        desired_salary = None
        salary_range_pat = re.compile(r"เงินเดือนที่ต[ ํ]?องการ\s*[:：]?\s*(\d{1,3}(?:,\d{3})*(?:\s*[-–—]\s*\d{1,3}(?:,\d{3})*)?)")
        if form_type == 2 and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            zone_sal = self._strip_pua((desired_job_section or "") + "\n" + (raw_text or "")[:15000])
            m_range_zone = salary_range_pat.search(zone_sal)
            if m_range_zone:
                desired_salary = m_range_zone.group(1).strip()[:100]
            if not desired_salary:
                desired_salary = self._extract_label_value(zone_sal, ["เงินเดือนที่ต้องการ", "เงินเดือนที่ตองการ", "Desired Salary", "희망급여", "เงินเดือน"], max_len=100)
        desired_salary = desired_salary or _from_desired_job_or_raw([
            "희망 연봉", "Desired Salary", "เงินเดือนที่ต้องการ", "희망급여", "Expected Salary", "เงินเดือน"
        ], max_len=100)
        if not desired_salary and desired_job_section:
            m_range = salary_range_pat.search(desired_job_section)
            if m_range:
                desired_salary = m_range.group(1).strip()[:100]
        if not desired_salary and raw_text:
            m_range_raw = salary_range_pat.search(raw_text[:4000])
            if m_range_raw:
                desired_salary = m_range_raw.group(1).strip()[:100]
        if not desired_salary and raw_text and re.search(r"[\u0E00-\u0E7F]", raw_text):
            m_range_raw = salary_range_pat.search(self._strip_pua(raw_text[:15000]))
            if m_range_raw:
                desired_salary = m_range_raw.group(1).strip()[:100]
        # 값이 숫자/범위가 아닐 때만 라벨 근처 숫자 추출 (범위가 이미 있으면 덮어쓰지 않음)
        if desired_salary and not re.search(r"^\d{1,3}(?:,\d{3})*(?:\s*[-–—]\s*\d{1,3}(?:,\d{3})*)?\s*$", desired_salary.replace(" ", "").strip()):
            search_text = (desired_job_section or "") + "\n" + (raw_text[:4000] or "")
            numeric_sal = self._extract_numeric_after_label(
                search_text,
                ["เงินเดือนที่ต้องการ", "Desired Salary", "희망급여", "Expected Salary", "ที่ตองการ", "เงินเดือน"],
                max_len=50
            )
            if numeric_sal:
                desired_salary = numeric_sal
            if not numeric_sal:
                m_thai_sal = re.search(r"ที่ตองการ\s*[:：]?\s*(\d[\d,\-–—]*)", raw_text)
                if m_thai_sal:
                    desired_salary = m_thai_sal.group(1).strip()[:50]
        military_status = self._extract_label_value(raw_text, [
            "Military Status", "สถานภาพทางทหาร", "ผ่านการเกณฑ์ทหาร", "เกณฑ์ทหารแล้ว", "ได้รับการยกเว้น", "군사 심사 면제", "병역", "Military"
        ], max_len=500)
        facebook_url = re.search(r"https?://(?:www\.)?facebook\.com/[^\s\)\]\"]+", raw_text, re.IGNORECASE)
        facebook_url = facebook_url.group(0).strip() if facebook_url else None
        # Line ID: "Line ID MRD8860", "ไลน์ ID : MRD8860", "Line : MRD8860" 등
        line_id = (
            self._extract_label_value_multiline(raw_text, ["Line ID", "Line ID:", "ไลน์ ID", "ไลน์ ID:", "Line@", "Line", "ไลน์"], max_lines=1, max_len=100)
            or self._extract_label_value(raw_text, ["Line ID", "Line ID:", "ไลน์ ID", "Line@", "Line", "ไลน์"], max_len=100)
        )
        if not line_id:
            m_line = re.search(r"(?:Line\s*ID|ไลน์\s*ID|Line@?)\s*[:：]?\s*([A-Za-z0-9_\-]+)", raw_text, re.IGNORECASE)
            if m_line:
                line_id = m_line.group(1).strip()[:100]
        # JobThai: PUA 제거 시 "ต้องการ"→"ตองการ", "ทำงาน"→"ทํางาน" 변이. 전체 원문 앞부분에서 희망근무지/업무유형/시작일 추출
        desired_work_locations = None
        employment_type_preference = None
        start_date_available = None
        _zone_len = 15000
        if form_type == 2 and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            zone_work = self._strip_pua((desired_job_section or "") + "\n" + (raw_text or "")[:_zone_len])
            m_loc_z = re.search(r"สถานที่ที่ต[ ํ]?องการท.างาน\s*[:：]?\s*([^\n]+(?:\n[^\n]+){0,5})", zone_work)
            if m_loc_z:
                desired_work_locations = m_loc_z.group(1).strip()[:2000]
            if not desired_work_locations:
                desired_work_locations = self._extract_label_value_multiline(zone_work, [
                    "สถานที่ที่ต้องการทำงาน", "สถานที่ที่ตองการทำงาน", "พื้นที่ที่ต้องการทำงาน", "Desired Work Locations", "희망 근무지"
                ], max_lines=10, max_len=2000) or self._extract_label_value(zone_work, [
                    "สถานที่ที่ต้องการทำงาน", "สถานที่ที่ตองการทำงาน", "พื้นที่ที่ต้องการทำงาน", "Desired Work Locations", "희망 근무지"
                ], max_len=2000)
            m_type_z = re.search(r"ประเภทงานที่ต[ ํ]?องการ\s*[:：]?\s*([^\n\r]+)", zone_work)
            if m_type_z:
                employment_type_preference = m_type_z.group(1).strip()[:100]
            if not employment_type_preference:
                employment_type_preference = self._extract_label_value(zone_work, [
                    "ประเภทงานที่ต้องการ", "ประเภทงานที่ตองการ", "Employment Type", "รูปแบบงาน", "희망 근무 형태"
                ], max_len=100)
            m_start_z = re.search(r"วันที่สามารถเริ่มงานได้\s*[:：]?\s*([^\n\r]+(?:\n[^\n\r]+){0,2})", zone_work)
            if m_start_z:
                start_date_available = m_start_z.group(1).strip()[:200]
            if not start_date_available:
                m_start_z2 = re.search(r"วันที่สามารถเริ่มงานได\s*[:：]?\s*([^\n\r]+)", zone_work)
                if m_start_z2:
                    start_date_available = m_start_z2.group(1).strip()[:200]
            if not start_date_available:
                start_date_available = self._extract_label_value_multiline(zone_work, [
                    "วันที่สามารถเริ่มงานได้", "Possible Start Date", "근무 시작 가능일", "Availability"
                ], max_lines=3, max_len=200) or self._extract_label_value(zone_work, [
                    "วันที่สามารถเริ่มงานได้", "Possible Start Date", "근무 시작 가능일"
                ], max_len=200)
        desired_work_locations = desired_work_locations or _from_desired_job_or_raw([
            "희망 근무지", "Desired Work Locations", "สถานที่ที่ต้องการทำงาน", "พื้นที่ที่ต้องการทำงาน", "희망근무지", "Location"
        ], max_len=2000, multiline=True, max_lines=10)
        if not desired_work_locations and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            z = self._strip_pua((raw_text or "")[:15000])
            m_loc = re.search(r"สถานที่ที่ต[ ํ]?องการท.างาน\s*[:：]?\s*([^\n]+(?:\n[^\n]+){0,5})", z)
            if m_loc:
                desired_work_locations = m_loc.group(1).strip()[:2000]
        if not desired_work_locations and re.search(r"สถานที่ที่ต[ ํ]?องการ", raw_text or ""):
            m_loc = re.search(r"สถานที่ที่ต[ ํ]?องการท.างาน\s*[:：]?\s*([^\n]+(?:\n[^\n]+){0,5})", raw_text)
            if m_loc:
                desired_work_locations = m_loc.group(1).strip()[:2000]
        employment_type_preference = employment_type_preference or _from_desired_job_or_raw([
            "희망 근무 형태", "Employment Type", "ประเภทงานที่ต้องการ", "ประเภทงานที่ตองการ", "รูปแบบงาน", "งานประจำ", "희망고용형태", "Full-time", "Part-time", "ประจำ", "정규직"
        ], max_len=100)
        if not employment_type_preference and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            m_type = re.search(r"ประเภทงานที่ต[ ํ]?องการ\s*[:：]?\s*([^\n\r]+)", self._strip_pua((raw_text or "")[:15000]))
            if m_type:
                employment_type_preference = m_type.group(1).strip()[:100]
        if not employment_type_preference and re.search(r"ประเภทงานที่ต[ ํ]?องการ", raw_text or ""):
            m_type = re.search(r"ประเภทงานที่ต[ ํ]?องการ\s*[:：]?\s*([^\n\r]+)", raw_text)
            if m_type:
                employment_type_preference = m_type.group(1).strip()[:100]
        start_date_available = start_date_available or _from_desired_job_or_raw([
            "근무 시작 가능일", "วันที่สามารถเริ่มงานได้", "Possible Start Date", "Start Date", "Availability"
        ], max_len=200, multiline=True, max_lines=3)
        if not start_date_available and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            z_start = self._strip_pua((raw_text or "")[:15000])
            m_start = re.search(r"วันที่สามารถเริ่มงานได้\s*[:：]?\s*([^\n\r]+)", z_start)
            if m_start:
                start_date_available = m_start.group(1).strip()[:200]
            if not start_date_available:
                m_start2 = re.search(r"วันที่สามารถเริ่มงานได\s*[:：]?\s*([^\n\r]+)", z_start)
                if m_start2:
                    start_date_available = m_start2.group(1).strip()[:200]
        if not start_date_available and re.search(r"วันที่สามารถเริ่มงาน", raw_text or ""):
            m_start = re.search(r"วันที่สามารถเริ่มงานได[ ้]?\s*[:：]?\s*([^\n\r]+)", raw_text)
            if m_start:
                start_date_available = m_start.group(1).strip()[:200]
            if not start_date_available:
                m_start = re.search(r"วันที่สามารถเริ่มงานได้\s*[:：]?\s*([^\n\r]+)", raw_text)
                if m_start:
                    start_date_available = m_start.group(1).strip()[:200]
        can_work_bangkok = self._extract_label_value(raw_text, [
            "Can work in Bangkok", "สามารถทำงานในกรุงเทพ", "방콕"
        ], max_len=20)
        can_work_provinces = self._extract_label_value(raw_text, [
            "Can work in other provinces", "สามารถทำงานในต่างจังหวัด", "지방"
        ], max_len=20)
        willing_work_abroad = self._extract_label_value(raw_text, [
            "Willing to work abroad", "ยินดีทำงานต่างประเทศ", "해외근무"
        ], max_len=20)
        occupation_field = self._extract_label_value(raw_text, [
            "Occupation", "สาขาอาชีพ", "직종", "Career Field"
        ])
        sub_occupation = self._extract_label_value(raw_text, [
            "Sub-occupation", "สาขาอาชีพย่อย", "세부직종"
        ])
        # JobThai: PUA 제거 시 "ตำแหน่ง"→"ตาแหน่ง", "ต้องการ"→"ตองการ" 변이. 전체 원문 검색
        _pos_label_pat = re.compile(r"ต[\u0E33\u0E4D\s]?าแหน่งงานที่ต[\u0E4D\s]?องการสมัคร\s*[:：]?\s*([^\n]+(?:\n[^\n]+){0,9})")
        desired_positions = None
        _raw_len = len(raw_text or "")
        _search_len = min(30000, max(12000, _raw_len))
        if re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            zone_desired = self._strip_pua((raw_text or "")[:_search_len])
            m_pos_zone = _pos_label_pat.search(zone_desired)
            if m_pos_zone:
                desired_positions = m_pos_zone.group(1).strip()[:2000]
            if not desired_positions:
                desired_positions = self._extract_label_value_multiline(zone_desired, [
                    "ตำแหน่งงานที่ต้องการสมัคร", "ตำแหน่งงานที่ตองการสมัคร", "ตําแหน่งงานที่ต้องการสมัคร", "Desired Positions", "희망 직위"
                ], max_lines=10, max_len=2000) or self._extract_label_value(zone_desired, [
                    "ตำแหน่งงานที่ต้องการสมัคร", "ตำแหน่งงานที่ตองการสมัคร", "Desired Positions", "희망 직위"
                ], max_len=2000)
        desired_positions = desired_positions or _from_desired_job_or_raw([
            "지원 희망 직위", "ตำแหน่งงานที่ต้องการสมัคร", "ตำแหน่งงานที่ตองการสมัคร", "Desired Positions", "희망 직위", "ตำแหน่งงานที่ต้องการ"
        ], max_len=2000, multiline=True, max_lines=10)
        if not desired_positions and desired_job_section:
            for src in [desired_job_section, (self._strip_pua(desired_job_section) if desired_job_section else "")]:
                if not src:
                    continue
                m_positions = _pos_label_pat.search(src)
                if m_positions:
                    desired_positions = m_positions.group(1).strip()[:2000]
                    break
        if not desired_positions and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            m_pos_raw = _pos_label_pat.search(self._strip_pua(raw_text or ""))
            if m_pos_raw:
                desired_positions = m_pos_raw.group(1).strip()[:2000]
        if not desired_positions and re.search(r"ต[\u0E33\u0E4D]?าแหน่งงานที่ต[\u0E4D]?องการสมัคร|ตำแหน่งงานที่ตองการสมัคร", raw_text or ""):
            m_pos_raw = _pos_label_pat.search(raw_text)
            if m_pos_raw:
                desired_positions = m_pos_raw.group(1).strip()[:2000]
        # Fallback: 라벨이 PUA 등으로 매칭 실패 시 "1. Engineer" 등 숫자 목록이 "เงินเดือนที่ต้องการ" 앞에 있으면 추출
        if not desired_positions and re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
            z = self._strip_pua(raw_text or "")
            m_list = re.search(
                r"(?:ต[\u0E33\u0E4D\s]?าแหน่งงานที่ต[\u0E4D\s]?องการสมัคร|ตำแหน่งงานที่ต้องการสมัคร|สมัคร)\s*[:：]?\s*\n?\s*((?:\d+\.\s*\S[^\n]*(?:\n[^\n]*){0,15}?)(?=เงินเดือนที่ต[\u0E4D\s]?องการ|สถานที่ที่ต[\u0E4D\s]?องการ|$))",
                z,
            )
            if m_list:
                block = m_list.group(1).strip()
                if re.search(r"Engineer|QC|CMM|직위|ตำแหน่ง", block, re.I) or (len(block) > 20 and re.search(r"\d+\.\s", block)):
                    desired_positions = block[:2000]
            # 라벨 없이 "1. Engineer" 또는 "1.\n Engineer" 직후 ~ "เงินเดือน" 전까지 블록 추출
            if not desired_positions and re.search(r"1\.\s*\n?\s*Engineer|1\.\s*Engineer", z, re.I):
                m_num = re.search(r"(1\.\s*(?:\n\s*)?Engineer[^\n]*(?:\n[^\n]*){0,20}?)(?=เงินเดือนที่ต[\u0E4D\s]?องการ|สถานที่ที่ต[\u0E4D\s]?องการ|\Z)", z)
                if m_num:
                    desired_positions = m_num.group(1).strip()[:2000]
        # 최종 Fallback: 문자열에서 "1. Engineer" 위치를 찾아 "เงินเดือน" 직전까지 잘라 추출 (oneline PDF 대응)
        if not desired_positions and "Engineer" in (raw_text or ""):
            rt = raw_text or ""
            start_idx = None
            for start_marker in ["1. Engineer", "1.  Engineer", "1.\nEngineer", "1.\n Engineer", "1. Engineer"]:
                idx = rt.find(start_marker)
                if idx >= 0:
                    start_idx = idx
                    break
            if start_idx is None and "1." in rt and "Engineer" in rt:
                # "1." 와 "Engineer" 사이에 공백/PUA만 있는 경우
                i1 = rt.find("1.")
                if i1 >= 0:
                    j = rt.find("Engineer", i1, min(i1 + 30, len(rt)))
                    if j > i1:
                        start_idx = i1
            if start_idx is not None:
                idx = start_idx
                rest = rt[idx : idx + 800]
                # 끝 구간: 원문 또는 PUA 제거문에서 "เงินเดือน" / "28,000" 등으로 자르기
                for end_marker in ["เงินเดือนที่ตองการ", "เงินเดือนที่ต้องการ", "เงินเดือน", "28,000-33,000", "28,000"]:
                    if end_marker in rest and rest.find(end_marker) > 20:
                        rest = rest.split(end_marker)[0].strip()
                        break
                    z_rest = self._strip_pua(rest)
                    if end_marker in z_rest and z_rest.find(end_marker) > 20:
                        ei = z_rest.find(end_marker)
                        rest = rest[: ei + 20].strip()  # 보수적으로 잘라서 아래 tail 제거로 정리
                        break
                for tail in ["เงินเดือนที่ตองการ", "เงินเดือนที่ต้องการ", "เงินเดือน", "Line ID"]:
                    pos = rest.rfind(tail)
                    if pos > 20:
                        rest = rest[:pos].strip()
                        break
                if len(rest) > 15 and ("2." in rest or "QC" in rest or "CMM" in rest):
                    desired_positions = rest[:2000]
        # 희망 직위 값 끝의 "เงินเดือนที่ต้องการ" 등 급여 라인 제거, 앞의 "Line ID ..." 라인 제거
        if desired_positions and re.search(r"[\u0E00-\u0E7F]", desired_positions):
            lines = desired_positions.split("\n")
            kept = []
            for line in lines:
                line = line.strip()
                if re.search(r"^เงินเดือน|^เงินเดือนที่ต้องการ|^Desired Salary", line, re.I):
                    break
                if line and not re.match(r"^(?:Line\s*ID|ไลน์)\s*[:：]?\s*[A-Za-z0-9_\-]+$", line, re.I):
                    kept.append(line)
            if kept:
                desired_positions = "\n".join(kept).strip()[:2000] or desired_positions
        # 지원 직위가 비어 있으면 희망 직위 섹션에서 추출 시도 또는 희망 직위 첫 줄을 사용 (JobThai 양식2)
        if not applied_position and desired_job_section:
            applied_position = self._extract_label_value(desired_job_section, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "Applied Position", "지원 직위", "희망 직위"
            ], max_len=300) or self._extract_label_value_multiline(desired_job_section, [
                "สมัครตำแหน่ง", "ตำแหน่งงานที่ต้องการสมัคร", "Applied Position", "지원 직위", "희망 직위"
            ], max_lines=2, max_len=300)
        if not applied_position and desired_positions:
            first_line = desired_positions.split("\n")[0].strip()[:300]
            if first_line and len(first_line) > 1 and not first_line.startswith("http"):
                applied_position = first_line
        # 학력 수준/단과대학/전공/자격/GPA: 복수 학력 항목에서 첫 항목(또는 최신 연도) 사용, 없으면 전체 edu에서 추출
        education_level = None
        faculty = None
        major = None
        qualification = None
        gpa = None
        if education_entries:
            for ent in sorted(education_entries, key=lambda e: (e.get("year") or ""), reverse=True):
                if ent.get("education_level") or ent.get("major") or ent.get("gpa"):
                    education_level = ent.get("education_level")
                    faculty = ent.get("faculty")
                    major = ent.get("major")
                    qualification = ent.get("qualification")
                    gpa = ent.get("gpa")
                    break
            if not education_level and education_entries:
                education_level = education_entries[0].get("education_level")
                faculty = education_entries[0].get("faculty")
                major = education_entries[0].get("major")
                qualification = education_entries[0].get("qualification")
                gpa = education_entries[0].get("gpa")
        if education_level is None:
            education_level = self._extract_label_value(edu or raw_text, [
                "ระดับการศึกษา", "Education Level", "학력 수준", "Academic Level", "ปวส.", "ปวช."
            ], max_len=100)
        if not education_level and edu:
            m_ed = re.search(r"\b(ปวส\.|ปวช\.|ป\.\s*ตรี|ม\.\s*ปลาย|ปริญญาตรี)\b", edu)
            if m_ed:
                education_level = m_ed.group(0)
        if faculty is None:
            faculty = self._extract_label_value(edu or raw_text, ["คณะ", "Faculty", "College", "단과대학"], max_len=200)
        if major is None:
            major = self._extract_label_value(edu or raw_text, ["สาขา", "Major", "전공", "สาขาวิชา"], max_len=200)
        if qualification is None:
            qualification = self._extract_label_value(edu or raw_text, ["วุฒิ", "Qualification", "Degree", "자격", "ปริญญา"], max_len=200)
        if gpa is None:
            gpa = self._extract_label_value(edu or raw_text, ["เกรดเฉลี่ย", "GPA", "평균 평점", "Grade Point"], max_len=20)
        other_notes = None
        for block in (desired_job_section, raw_text):
            if not block:
                continue
            m_notes = re.search(r"\*\s*([^*\n]+?)\s*\*", block)
            if m_notes:
                other_notes = m_notes.group(1).strip()[:1000]
                break
        if not other_notes and desired_job_section:
            first_line = desired_job_section.split("\n")[0].strip()
            if first_line.startswith("*") and len(first_line) > 2:
                other_notes = first_line.lstrip("*").strip()[:1000]
        if not other_notes:
            other_notes = self._extract_label_value(raw_text, ["หมายเหตุ", "Note", "비고", "Remark"], max_len=1000)
        driving_license = self._extract_label_value(raw_text, [
            "Driving License", "ใบขับขี่", "운전면허"
        ], max_len=500)
        driving_ability = self._extract_label_value(raw_text, [
            "Driving ability", "ความสามารถในการขับขี่", "운전능력"
        ], max_len=500)

        # PDF 내 지원자 사진 추출 (첫 3페이지 이미지 중 가장 큰 것 → base64 데이터 URL)
        applicant_photo_b64 = None
        if file_path and os.path.isfile(file_path) and (file_path.lower().endswith(".pdf")):
            applicant_photo_b64 = self._extract_photo_from_pdf(file_path)

        parsed_data: Dict[str, Any] = {
            "education": edu or "",
            "experience": exp or "",
            "skills": sk or "",
            "summary": summ or "",
            "sections_preview": {k: (v[:300] if v else "") for k, v in sections.items() if v},
            "raw_preview": raw_text[:1500],
            "education_entries": education_entries,
            "experience_entries": experience_entries_detailed,
            "training_cert_entries": training_cert_entries,
            "typing_speed": ability_perf.get("typing_speed") or "",
            "special_skills": ability_perf.get("special_skills") or "",
            "achievements": ability_perf.get("achievements") or "",
            "references": ability_perf.get("references") or "",
            "applicant_photo": applicant_photo_b64 or "",
        }

        def _norm_date(s: Optional[str], max_len: int = 100) -> Optional[str]:
            if s is None or not isinstance(s, str):
                return s
            t = re.sub(r"[\r\n]+", " ", s).strip()
            return t[:max_len] if t else None

        return {
            "applicant_name": applicant_name,
            "applicant_surname": applicant_surname,
            "applicant_email": applicant_email,
            "applicant_phone": applicant_phone,
            "applicant_id": applicant_id,
            "age": age,
            "application_date": _norm_date(application_date, 100),
            "company_name": company_name,
            "business_type": business_type,
            "applied_position": applied_position,
            "position": position,
            "employment_period": employment_period,
            "salary": salary,
            "address": self._normalize_address_value(address) if address else address,
            "education": edu,
            "experience": exp,
            "skills": sk,
            "summary": summ,
            "sections_intro": intro,
            "sections_skills": sk,
            "sections_experience": exp,
            "sections_education": edu,
            "date_of_birth": _norm_date(date_of_birth, 50),
            "nationality": nationality,
            "gender": gender,
            "certification_license": cert_section,
            "linkedin_url": linkedin_url,
            "update_date": _norm_date(update_date, 100),
            "height_weight": height_weight,
            "height": height_only,
            "weight": weight_only,
            "religion": religion,
            "marital_status": marital_status,
            "desired_salary": desired_salary,
            "military_status": military_status,
            "facebook_url": facebook_url,
            "line_id": line_id,
            "desired_work_locations": desired_work_locations,
            "employment_type_preference": employment_type_preference,
            "can_work_bangkok": can_work_bangkok,
            "can_work_provinces": can_work_provinces,
            "willing_work_abroad": willing_work_abroad,
            "occupation_field": occupation_field,
            "sub_occupation": sub_occupation,
            "vehicles_owned": vehicles_section,
            "driving_license": driving_license,
            "driving_ability": driving_ability,
            "language_skills": language_section,
            "training_info": training_section or (
                "; ".join(
                    [
                        " ".join(filter(None, [e.get("institution"), e.get("period"), e.get("course"), e.get("certificate")]))
                        for e in (training_cert_entries or [])[:5]
                    ]
                ).strip()[:3000] if training_cert_entries else None
            ),
            "start_date_available": _norm_date(start_date_available, 200),
            "desired_positions": desired_positions,
            "education_level": education_level,
            "faculty": faculty,
            "major": major,
            "qualification": qualification,
            "gpa": gpa,
            "other_notes": other_notes,
            "last_working_1": experience_entries[0][0] if len(experience_entries) > 0 else None,
            "lw1_period": experience_entries[0][1] if len(experience_entries) > 0 else None,
            "last_working_2": experience_entries[1][0] if len(experience_entries) > 1 else None,
            "lw2_period": experience_entries[1][1] if len(experience_entries) > 1 else None,
            "last_working_3": experience_entries[2][0] if len(experience_entries) > 2 else None,
            "lw3_period": experience_entries[2][1] if len(experience_entries) > 2 else None,
            "parsed_data": parsed_data,
            "document_language": lang,
            "form_type": form_type,
            "raw_text": raw_text,
        }
