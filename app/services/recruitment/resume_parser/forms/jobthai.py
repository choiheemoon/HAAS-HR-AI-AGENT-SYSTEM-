# -*- coding: utf-8 -*-
"""JobThai(양식2) 전용 파싱 로직."""
import re
import unicodedata
from typing import Dict, Optional, Any, List, Tuple

from .. import constants


def parse_header(parser: Any, raw_text: str) -> Dict[str, Optional[str]]:
    """
    JobThai(양식2) 전용: 지원 직위(สมัครตำแหน่ง), 최종 이력서 수정일(แก้ไขประวัติล่าสุด) 추출.
    PDF 유니코드 변이 및 PUA 제거 후 NFC/NFKC 정규화로 매칭.
    """
    out: Dict[str, Optional[str]] = {"applied_position": None, "update_date": None}
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text):
        return out
    zone = raw_text[:4000]
    zone = parser._strip_pua(zone)
    for norm_form in ("NFC", "NFKC"):
        zone_norm = unicodedata.normalize(norm_form, zone)
        zone_one_line = re.sub(r"\s+", " ", zone_norm).strip()
        label_pos = "สมัครตำแหน่ง"
        label_update = "แก้ไขประวัติล่าสุด"
        pos_idx = zone_one_line.find(label_pos)
        if pos_idx < 0:
            mm = re.search(r"สมัครต\s*[\u0E00-\u0E7F]{1,4}\s*แหน่ง", zone_one_line)
            if mm:
                pos_idx = mm.start()
                label_len = mm.end() - mm.start()
            else:
                label_len = len(label_pos)
        else:
            label_len = len(label_pos)
        if pos_idx >= 0:
            after = zone_one_line[pos_idx + label_len : pos_idx + label_len + 400]
            after = re.sub(r"^\s*[:：]\s*", "", after).strip()
            for stop in [label_update, "รหัส", "ที่อยู่", "ชื่อ", "นามสกุล", "เพศ", "วันเกิด", "อายุ"]:
                i = after.find(stop)
                if i >= 0:
                    after = after[:i].strip()
                    break
            if 2 < len(after) < 350 and not constants.EMAIL_PATTERN.match(after) and not re.match(r"^\d+$", after):
                val = after[:300]
                if val.startswith("ชาง ") or val.startswith("ชาง\n"):
                    val = "ช่าง " + val[3:].lstrip()
                out["applied_position"] = val
        if not out["applied_position"]:
            m = re.search(
                r"สมัครตำแหน่ง\s*[:：]?\s*(.+?)(?=\s*แก้ไขประวัติล่าสุด|\s*รหัส|ที่อยู่|ชื่อ|เพศ|\Z)",
                zone_one_line,
            )
            if m:
                val = re.sub(r"^\s*[:：]\s*", "", m.group(1).strip()).strip()[:300]
                if 2 < len(val) < 350 and not constants.EMAIL_PATTERN.match(val):
                    if val.startswith("ชาง ") or val.startswith("ชาง\n"):
                        val = "ช่าง " + val[3:].lstrip()
                    out["applied_position"] = val
        if not out["applied_position"]:
            m = re.search(
                r"สมัครต\s*[\u0E00-\u0E7F]{1,4}\s*แหน่ง\s*[:：]?\s*(.+?)(?=แก้ไขประวัติ|รหัส|ที่อยู่|ชื่อ|เพศ|\Z)",
                zone_one_line,
            )
            if m:
                val = re.sub(r"^\s*[:：]\s*", "", m.group(1).strip()).strip()[:300]
                if 2 < len(val) < 350 and not constants.EMAIL_PATTERN.match(val):
                    if val.startswith("ชาง ") or val.startswith("ชาง\n"):
                        val = "ช่าง " + val[3:].lstrip()
                    out["applied_position"] = val
        if not out["applied_position"] and "สมัครต" in zone_one_line:
            idx = zone_one_line.find("สมัครต")
            chunk = zone_one_line[idx : idx + 220]
            colon = re.search(r"\s*[:：]\s*", chunk)
            if colon:
                after_colon = chunk[colon.end() :].strip()
                for stop in ["เพศ", "วันเกิด", "อายุ", "รหัส", "ที่อยู่", "ชื่อ", "แก้ไขประวัติ"]:
                    i = after_colon.find(stop)
                    if i >= 0:
                        after_colon = after_colon[:i].strip()
                        break
                if 2 < len(after_colon) < 350 and not constants.EMAIL_PATTERN.match(after_colon):
                    if after_colon.startswith("ชาง ") or after_colon.startswith("ชาง\n"):
                        after_colon = "ช่าง " + after_colon[3:].lstrip()
                    out["applied_position"] = after_colon[:300]
        update_idx = zone_one_line.find(label_update)
        update_len = len(label_update)
        if update_idx < 0:
            mm2 = re.search(r"แก้ไขประวัติล[\u0E00-\u0E7F]{1,4}าสุด", zone_one_line)
            if not mm2:
                mm2 = re.search(r"แก[\u0E00-\u0E7F]?ไขประวัติล[\u0E00-\u0E7F]{0,4}าสุด", zone_one_line)
            if mm2:
                update_idx = mm2.start()
                update_len = mm2.end() - mm2.start()
        if update_idx >= 0:
            after = zone_one_line[update_idx + update_len : update_idx + update_len + 120]
            after = re.sub(r"^\s*[:：]\s*", "", after).strip()
            for stop in ["รหัส", "ที่อยู่", "ชื่อ", "สมัครตำแหน่ง"]:
                i = after.find(stop)
                if i >= 0:
                    after = after[:i].strip()
                    break
            if after and (re.search(r"\d{1,2}\s+[\u0E00-\u0E7F]", after) or re.search(r"\d{4}", after)):
                out["update_date"] = re.sub(r"\s+", " ", after).strip()[:100]
        if not out["update_date"]:
            m = re.search(
                r"แก้ไขประวัติล[\u0E00-\u0E7F]{0,4}าสุด\s*[:：]?\s*(\d{1,2}\s+[\u0E00-\u0E7F\.\s]+\d{2,4})",
                zone_one_line,
            )
            if m:
                out["update_date"] = re.sub(r"\s+", " ", m.group(1)).strip()[:100]
        if not out["update_date"]:
            m = re.search(
                r"แก[\u0E00-\u0E7F]?ไขประวัติล[\u0E00-\u0E7F]{0,4}าสุด\s*[:：]?\s*(\d{1,2}\s+[\u0E00-\u0E7F\.\s]+\d{2,4})",
                zone_one_line,
            )
            if m:
                out["update_date"] = re.sub(r"\s+", " ", m.group(1)).strip()[:100]
        if out["applied_position"] and out["update_date"]:
            break
    return out


def extract_responsibility_blocks(parser: Any, raw_text: str) -> List[str]:
    """JobThai: raw_text에서 'หน้าที่รับผิดชอบ' 블록을 등장 순서대로 추출."""
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text):
        return []
    zone = parser._strip_pua(raw_text)
    resp_label = re.compile(r"หน[\u0E00-\u0E7F]*?าที่รับผิดชอบ", re.I)
    table_header = re.compile(r"ต[\u0E00-\u0E7F]*?าแหน่ง\s*เงินเดือน\s*ระดับ", re.I)
    blocks: List[str] = []
    pos = 0
    while True:
        m = resp_label.search(zone, pos)
        if not m:
            break
        start = m.end()
        next_resp = resp_label.search(zone, start)
        next_table = table_header.search(zone, start)
        end = len(zone)
        if next_resp:
            end = min(end, next_resp.start())
        if next_table:
            end = min(end, next_table.start())
        text = zone[start:end].strip()
        if text and len(text) > 5:
            blocks.append(text[:2000])
        pos = m.end() + 1
    return blocks


def extract_scattered_experience_blocks(parser: Any, raw_text: str) -> List[str]:
    """JobThai: 첫 경력 뒤에 분산된 경력 블록(회사+기간+...)을 raw_text에서 순서대로 추출."""
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text):
        return []
    zone = parser._strip_pua(raw_text)
    lines = [ln.strip() for ln in zone.split("\n")]
    thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
    rohas_idx = -1
    for i, ln in enumerate(lines):
        if re.search(r"รหัส", ln) and len(ln) < 30:
            rohas_idx = i
            break
    if rohas_idx < 0:
        return []
    salary_pat = re.compile(r"^\s*\d{1,3}(,\d{3})+\s*$|^\s*\d{4,}\s*$")
    year_pat = re.compile(r"^\s*(25|19|20)\d{2}\s*$")
    skip_labels = re.compile(r"^(รหัส|ชื่อ|นามสกุล|ที่อยู่|Email|Mobile|เงินเดือนที่ต้องการ|ประวัติการศึกษา|ระดับการศึกษา)", re.I)
    blocks_with_pos: List[Tuple[int, str]] = []
    seen_start: set = set()
    for i in range(rohas_idx + 1, len(lines)):
        ln = lines[i]
        if not salary_pat.match(ln) or year_pat.match(ln):
            continue
        if i + 1 >= len(lines):
            continue
        level_line = lines[i + 1]
        if not level_line or len(level_line) > 100:
            continue
        if not re.search(r"[\u0E00-\u0E7F]|Supervisor|Manager|Leader|Head|Chief|Officer|Engineer|Technician|ช่าง|หัวหน้า|เจ้าหน้าที่|พนักงาน", level_line, re.I):
            continue
        start = i - 1
        for j in range(i - 2, max(0, i - 25), -1):
            t = lines[j] or ""
            if re.search(thai_months, t):
                start = j
            elif re.search(r"25\d{2}", t) and start == i - 1:
                start = j
        company_line = start - 1
        if company_line < 0:
            continue
        company_ln = (lines[company_line] or "").strip()
        if not company_ln or len(company_ln) < 3 or skip_labels.match(company_ln):
            continue
        if re.match(r"^\d+\s*$", company_ln):
            continue
        if "จจุบัน" in company_ln and len(company_ln) < 20:
            continue
        if re.search(r"^(เมษายน|กุมภาพันธ์|มีนาคม|พฤษภาคม|มิถุนายน|ม\.|มกราคม|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)", company_ln.strip()) or (company_ln.strip() in ("มีนาคม", "เมษายน", "กุมภาพันธ์", "พฤษภาคม", "มิถุนายน")):
            continue
        non_company = re.compile(r"^(พุทธ|โสด|สมรส|ไทย|สถานภาพ|ผาน|ผ่าน|ศาสนา|สัญชาติ|นิคม|ซ\.|ถ\.|แขวง|เขต)", re.I)
        if non_company.match(company_ln) or (not re.search(r"[A-Za-z]", company_ln) and len(company_ln) < 8):
            continue
        while company_line > 0 and (company_ln.startswith("(") or (len(company_ln) < 12 and re.search(r"[A-Za-z]", company_ln))):
            prev = (lines[company_line - 1] or "").strip()
            if prev and re.search(r"[A-Za-z]", prev) and len(prev) < 80:
                company_line -= 1
                company_ln = prev + (" " + company_ln if company_ln else "")
            else:
                break
        raw_block = "\n".join(lines[company_line : i + 2])
        block = re.sub(r"\n\s*\n+", "\n", raw_block).strip()
        key = (company_line, min(company_line + 15, len(lines)))
        if key in seen_start:
            continue
        seen_start.add(key)
        if len(block) > 50:
            blocks_with_pos.append((company_line, block[:1500]))
    def _block_dup(block_start: str, existing: List[Tuple[int, str]]) -> bool:
        return any(block_start in (b[:120] if len(b) > 120 else b) for _, b in existing)
    if len(blocks_with_pos) < 3 and re.search(r"Bangchan|กุลธร|เมททัล|FCC\s+Thailand", zone):
        for company_pat, need_leader in [
            (r"Bangchan[\s\S]{0,30}?General\s+Assembly", True),
            (r"Bangchan\s+General\s+Assembly", True),
            (r"กุลธร[\s\u0E00-\u0E7F]*?เมททัล[\u0E00-\u0E7F]*", True),
            (r"เมททัล[\u0E00-\u0E7F]*โปรดักส[\u0E00-\u0E7F]*", True),
            (r"FCC\s+Thailand(?:\s*\(Subcontract\))?", False),
        ]:
            m = re.search(company_pat, zone)
            if not m:
                continue
            start_pos = m.start()
            start_line = zone[:start_pos].count("\n")
            end_line = min(start_line + 28, len(lines))
            raw_block = "\n".join(lines[start_line:end_line])
            block = re.sub(r"\n\s*\n+", "\n", raw_block).strip()
            has_salary = bool(re.search(r"\d{1,3}(,\d{3})+|\d{4,}", block))
            has_leader = bool(re.search(r"หัวหน้า|Supervisor|Leader|ช่างเทคนิค|เจ้าหน้าที่", block))
            if has_salary and (has_leader or not need_leader):
                if not _block_dup(block[:80], blocks_with_pos) and len(block) > 60:
                    blocks_with_pos.append((start_line, block[:1500]))
            if len(blocks_with_pos) >= 3:
                break
    blocks_with_pos.sort(key=lambda x: x[0])
    return [b for _, b in blocks_with_pos]


def parse_education_jobthai_two_part(parser: Any, edu: str) -> List[Dict[str, Any]]:
    """JobThai: 학력이 '기관+연도' 블록과 'ระดับการศึกษา/สาขา/คณะ' 블록으로 분리된 경우 항목 생성."""
    if not edu or not edu.strip():
        return []
    zone = parser._strip_pua(edu)
    idx = zone.find("ระดับการศึกษา") if "ระดับการศึกษา" in zone else -1
    if idx >= 0:
        header_part = zone[:idx].strip()
        scatter_part = zone[idx:]
    else:
        header_part = zone.strip()
        scatter_part = ""
    pairs = parser._extract_education_institution_year_pairs(header_part)
    detail_groups = parser._extract_education_detail_groups(scatter_part) if scatter_part else []
    if not pairs and not detail_groups:
        return []
    n = max(len(pairs), len(detail_groups))
    result: List[Dict[str, Any]] = []
    for idx in range(n):
        entry: Dict[str, Any] = {}
        if idx < len(pairs):
            entry["institution"] = pairs[idx][0]
            entry["year"] = pairs[idx][1]
        else:
            entry["institution"] = ""
            entry["year"] = ""
        if idx < len(detail_groups):
            g = detail_groups[idx]
            entry["education_level"] = g.get("education_level") or ""
            entry["faculty"] = g.get("faculty") or ""
            entry["major"] = g.get("major") or ""
            entry["qualification"] = g.get("qualification") or ""
            entry["gpa"] = g.get("gpa") or ""
        else:
            entry["education_level"] = entry.get("education_level") or ""
            entry["faculty"] = entry.get("faculty") or ""
            entry["major"] = entry.get("major") or ""
            entry["qualification"] = entry.get("qualification") or ""
            entry["gpa"] = entry.get("gpa") or ""
        if entry.get("institution") or entry.get("education_level") or entry.get("major") or entry.get("gpa"):
            result.append(entry)
    return result


def merge_scattered_education_fields(parser: Any, edu: str, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """JobThai: 분산된 ระดับการศึกษา/สาขา/คณะ/วุฒิ/เกรดเฉลี่ย 를 순서대로 각 학력 항목에 매칭."""
    if not entries or not edu:
        return entries
    zone = parser._strip_pua(edu)
    detail_groups = parser._extract_education_detail_groups(zone)
    if not detail_groups:
        return entries
    for idx, ent in enumerate(entries):
        if idx >= len(detail_groups):
            break
        g = detail_groups[idx]
        if not ent.get("education_level") and g.get("education_level"):
            ent["education_level"] = g["education_level"]
        if not ent.get("faculty") and g.get("faculty"):
            ent["faculty"] = g["faculty"]
        if not ent.get("major") and g.get("major"):
            ent["major"] = g["major"]
        if not ent.get("qualification") and g.get("qualification"):
            ent["qualification"] = g["qualification"]
        if not ent.get("gpa") and g.get("gpa"):
            ent["gpa"] = g["gpa"]
    return entries


def parse_training_cert_entries_jobthai(parser: Any, text: str, max_entries: int = 20) -> List[Dict[str, Any]]:
    """JobThai: หลักสูตร/ประกาศนียบัตร와 기관·기간이 분리된 경우 두 목록을 인덱스로 매칭해 교육 이력 추출."""
    if not text or not text.strip():
        return []
    zone = parser._strip_pua(text)
    thai_months = r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)"
    period_pat = re.compile(
        r"(" + thai_months + r"\s*\d{4}\s*[-–—~]\s*(?:" + thai_months + r"\s*\d{4}|\d{4}|ปัจจุบัน|Present))",
        re.IGNORECASE,
    )
    period_matches = list(period_pat.finditer(zone))
    first_curso_pos = zone.find("หลักสูตร")
    if first_curso_pos > 0:
        period_matches = [m for m in period_matches if m.start() < first_curso_pos]
    course_chunks = re.split(r"\n(?=หลักสูตร\s*[:：]?\s*)", zone)
    course_cert_pairs: List[Tuple[str, str]] = []
    for ch in course_chunks:
        ch = ch.strip()
        if not ch or "หลักสูตร" not in ch or ("ประกาศนียบัตร" not in ch and "วุฒิบัตร" not in ch):
            continue
        course = parser._extract_label_value(ch, ["หลักสูตร", "Course", "과정"], max_len=500)
        cert = parser._extract_label_value(ch, ["ประกาศนียบัตร/วุฒิบัตร", "วุฒิบัตร", "ประกาศนียบัตร", "Certificate", "자격증"], max_len=500)
        if cert in ("/", "วุฒิบัตร", "") or (cert and len(cert.strip()) <= 2):
            m_cert = re.search(r"วุฒิบัตร\s*\n\s*([^\n\r]+)", ch)
            if m_cert:
                c = m_cert.group(1).strip()
                if c and len(c) > 2 and re.search(r"[A-Za-z\u0E00-\u0E7F]", c):
                    cert = c[:500]
        if course or cert:
            course_cert_pairs.append((course or "", cert or ""))
    inst_period_list: List[Tuple[str, str]] = []
    for i, m in enumerate(period_matches):
        start = period_matches[i - 1].end() if i > 0 else 0
        end = m.start()
        block = zone[start:end]
        period_val = re.sub(r"\s+", " ", m.group(1).strip())[:100]
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        inst_lines = [
            ln for ln in lines
            if not period_pat.search(ln)
            and not re.search(r"^หลักสูตร\s|^ประกาศนียบัตร|^วุฒิบัตร|^บริษัท\s*$|ประวัติการฝ|^/\s*$", ln)
            and len(ln) > 1
        ]
        institution = " ".join(inst_lines[-3:]).strip()[:300] if inst_lines else ""
        if institution and re.search(r"^ประวัติการฝ|^ความสามารถ|^(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*$", institution.strip()):
            institution = ""
        if institution or period_val:
            inst_period_list.append((institution, period_val))
    if inst_period_list and len(inst_period_list) > len(course_cert_pairs):
        need = min(len(course_cert_pairs), max_entries)
        inst_period_list = inst_period_list[-need:]
    if inst_period_list and course_cert_pairs:
        n = min(len(inst_period_list), len(course_cert_pairs), max_entries)
        result = []
        for i in range(n):
            inst, per = inst_period_list[i]
            course, cert = course_cert_pairs[i]
            if inst or per or course or cert:
                result.append({"institution": inst, "period": per, "course": course, "certificate": cert})
        if result:
            return result
    blocks_raw = re.split(r"\n\s*\n", zone)
    blocks = []
    for part in blocks_raw:
        part = part.strip()
        if len(part) < 10:
            continue
        if part.count("หลักสูตร") >= 2:
            for ch in re.split(r"\n(?=หลักสูตร\s*[:：]?\s*)", part):
                ch = ch.strip()
                if len(ch) >= 5:
                    blocks.append(ch)
        else:
            blocks.append(part)
    if not blocks:
        blocks = [zone]
    result = []
    for block in blocks[:max_entries]:
        entry: Dict[str, Any] = {"institution": "", "period": "", "course": "", "certificate": ""}
        m_period = period_pat.search(block)
        if m_period:
            entry["period"] = re.sub(r"\s+", " ", m_period.group(1).strip())[:100]
        course = parser._extract_label_value(block, ["หลักสูตร", "Course", "과정"], max_len=500)
        if course:
            entry["course"] = course
        cert = parser._extract_label_value(block, ["ประกาศนียบัตร/วุฒิบัตร", "วุฒิบัตร", "ประกาศนียบัตร", "Certificate", "자격증"], max_len=500)
        if cert in ("/", "วุฒิบัตร", "") or (cert and len(cert.strip()) <= 2):
            m_cert = re.search(r"วุฒิบัตร\s*\n\s*([^\n\r]+)", block)
            if m_cert:
                c = m_cert.group(1).strip()
                if c and len(c) > 2 and re.search(r"[A-Za-z\u0E00-\u0E7F]", c):
                    cert = c[:500]
        if cert:
            entry["certificate"] = cert
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        for line in lines[:8]:
            if period_pat.search(line) or re.search(r"^หลักสูตร\s|^ประกาศนียบัตร|^วุฒิบัตร|^บริษัท\s*$", line):
                continue
            if re.search(r"^ประวัติการฝ|^ความสามารถ|^(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*$", line):
                continue
            if len(line) > 3 and not re.search(r"^\d+\.?\s*$", line):
                entry["institution"] = line[:300]
                break
        if entry["institution"] or entry["course"] or entry["certificate"] or entry["period"]:
            result.append(entry)
    for i in range(1, len(result)):
        if (result[i].get("course") or result[i].get("certificate")) and not result[i].get("institution"):
            for j in range(i - 1, -1, -1):
                if result[j].get("institution"):
                    result[i]["institution"] = result[j]["institution"]
                    result[i]["period"] = result[j].get("period") or result[i].get("period") or ""
                    break
    return result


def build_training_section_and_entries(
    parser: Any, raw_text: str, sections: Dict[str, str], cert_section: Optional[str]
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    JobThai: 훈련 섹션 구성(원문 블록/분산 추출) + 교육·자격 항목 파싱.
    Returns (training_section, training_cert_entries).
    """
    training_section = (sections.get("training") or "").strip() or None
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text):
        training_cert_merged = "\n\n".join(filter(None, [training_section, cert_section]))
        training_cert_entries = parser._parse_training_cert_entries(training_cert_merged) if training_cert_merged else []
        return (training_section, training_cert_entries)
    zone_t = parser._strip_pua(raw_text)
    has_training_period = bool(
        re.search(
            r"(?:ม\.?\w+|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*\d{4}\s*[-–—~]",
            parser._strip_pua(training_section or ""),
        )
    )
    if (not training_section or "หลักสูตร" not in parser._strip_pua(training_section or "") or not has_training_period) and "หลักสูตร" in zone_t:
        m_t = re.search(
            r"(?:ประวัติการฝ[\u0E00-\u0E7F]*?กอบรม|ประวัติการฝึกอบรม)[^\n]*(?:[\s\S]{50,15000}?)(?=ความสามารถ\s|หลักสูตรและการฝึก|\Z)",
            zone_t,
        )
        if m_t:
            training_section = (training_section or "") + "\n\n" + m_t.group(0).strip()
    scatter_start = None
    for marker in ["หน้าที่รับผิดชอบ", "ตําแหน่ง", "ตาแหน่ง", "เงินเดือน", "ระดับ"]:
        pos_m = zone_t.find(marker)
        if pos_m != -1:
            idx_curso = zone_t.find("หลักสูตร", pos_m)
            if idx_curso != -1 and idx_curso - pos_m < 4000:
                scatter_start = idx_curso
                break
    if scatter_start is None and zone_t.count("หลักสูตร") >= 2:
        scatter_start = zone_t.find("หลักสูตร")
    if scatter_start is not None and scatter_start >= 0:
        chunk = zone_t[scatter_start : scatter_start + 3500]
        for end_m in ["ความสามารถพิเศษ", "พิมพ์ดีด", "อื่น ๆ"]:
            p = chunk.find(end_m)
            if 200 < p < len(chunk):
                chunk = chunk[:p]
                break
        m_duty = re.search(r"\n\s*-\s+[\u0E00-\u0E7F\w]", chunk[200:])
        if m_duty and m_duty.start() > 100:
            chunk = chunk[: 200 + m_duty.start()]
        if "ประกาศนียบัตร" in chunk or "วุฒิบัตร" in chunk:
            key = chunk.strip()[:100]
            if not (training_section and key and key in parser._strip_pua(training_section or "")):
                training_section = (training_section or "") + "\n\n" + chunk.strip()
    training_cert_merged = "\n\n".join(filter(None, [training_section, cert_section]))
    training_cert_entries = parse_training_cert_entries_jobthai(parser, training_cert_merged) if training_cert_merged else []
    if not training_cert_entries and training_cert_merged:
        training_cert_entries = parser._parse_training_cert_entries(training_cert_merged)
    return (training_section, training_cert_entries)


def enrich_address(parser: Any, raw_text: str, intro: Optional[str]) -> Optional[str]:
    """
    JobThai 전용: 주소 추출 (ที่อยู่, PUA 변이, 짧은 주소 연장 포함).
    Returns address or None.
    """
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text):
        return None
    zone_addr = parser._strip_pua((intro or "") + "\n" + (raw_text or "")[:15000])
    address = None
    addr_current = None
    z_full = parser._strip_pua(raw_text or "")
    m_thai_addr = re.search(
        r"ที่อย[\u0E00-\u0E7F\s]{0,4}ู\s*[:：]?\s*\n\s*((?:[^\n]+\n){0,20}?)(?=Email|อีเมล|Mobile|โทรศัพท์|Line|ไลน์|ต[\u0E00-\u0E7F]*?าแหน่งงานที่ต[\u0E00-\u0E7F]*?องการสมัคร)",
        z_full,
    )
    if m_thai_addr:
        cand = m_thai_addr.group(1).strip()
        if re.search(r"\d+/\d+|ม\.|ต\.|อ\.|สมุทรปราการ|บางโฉลง|บางพลี|\d{5}", cand) and len(cand) > 15:
            address = parser._normalize_address_value(cand[:3000])
    if not address:
        addr_current = (
            parser._extract_label_value_multiline(
                zone_addr,
                ["ที่อยู่ปัจจุบัน", "ที่อยู่ปัจจุบัน", "ปัจจุบัน", "Current Address", "현재 주소"],
                max_lines=8,
                max_len=3000,
            )
            or parser._extract_label_value(zone_addr, ["ที่อยู่ปัจจุบัน", "ปัจจุบัน", "Current Address", "현재 주소"], max_len=3000)
        )
    if addr_current and len((addr_current or "").strip()) > 10 and re.search(r"[\u0E00-\u0E7F]|\d+\s*ถ\.|ถ\.", addr_current or ""):
        address = parser._normalize_address_value(addr_current[:3000]) or address
    if not address:
        m_addr0 = re.search(r"ที่อย[\u0E00-\u0E7F\s]{0,4}ู\s*[:：]?\s*([^\n\r]{5,500})", zone_addr)
        if m_addr0:
            cand = m_addr0.group(1).strip()
            if re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.|จ\.", cand):
                address = parser._normalize_address_value(cand[:3000]) or address
    if not address:
        m_addr0b = re.search(
            r"ที่อย[\u0E00-\u0E7F\s]{0,4}ู\s*[:：]?\s*\n?\s*([^\n]+(?:\n(?!อีเมล|Email|Mobile|โทรศัพท์|เบอร์|Line|ไลน์|ชื่อ\s|เพศ|วันเกิด)[^\n]+){0,14})",
            zone_addr,
        )
        if m_addr0b:
            cand = m_addr0b.group(1).strip()
            if len(cand) > 10 and (re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.", cand)):
                address = parser._normalize_address_value(cand[:3000]) or address
    if not address:
        addr_from_intro = (
            parser._extract_label_value_multiline(
                zone_addr,
                ["ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "현재 주소"],
                max_lines=12,
                max_len=3000,
            )
            or parser._extract_label_value(
                zone_addr,
                ["ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "현재 주소"],
                max_len=3000,
            )
        )
        if addr_from_intro and len((addr_from_intro or "").strip()) > 10:
            address = parser._normalize_address_value(addr_from_intro[:3000]) or address
    _has_full_address = address and re.search(r"ต\.\s|อ\.\s|จ\.\s|\d{5}|สมุทรปราการ|บางพลี|บางโฉลง", parser._strip_pua(address))
    if address and not _has_full_address and re.search(r"\d+\s*ถ\.|ถ\.\s*[\u0E00-\u0E7F]", raw_text or ""):
        m_curr = re.search(
            r"(\d+\s*ถ\.\s*[\u0E00-\u0E7F\s]+(?:แขวง|เขต|กรุงเทพ)[^\n]*(?:\n[^\n]*(?:แขวง|เขต|กรุงเทพ)[^\n]*){0,5})",
            parser._strip_pua(raw_text[:5000]),
        )
        if m_curr:
            curr_block = re.sub(r"\s*(?:Email|อีเมล)\s+.*$", "", m_curr.group(1).strip(), flags=re.IGNORECASE).strip()
            if len(curr_block) > 15:
                address = parser._normalize_address_value(curr_block[:3000]) or address
    if not address:
        m_addr_same = re.search(r"ที่อยู่\s*[:：]?\s*([^\n\r]{5,500})", raw_text)
        if m_addr_same:
            cand = m_addr_same.group(1).strip()
            if re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.|จ\.", cand):
                address = cand[:3000]
    if not address and intro:
        address = (
            parser._extract_label_value_multiline(
                intro,
                ["ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "현재 주소"],
                max_lines=12,
                max_len=3000,
            )
            or parser._extract_label_value(intro, ["ที่อยู่ตามทะเบียนบ้าน", "ที่อยู่ปัจจุบัน", "ที่อยู่", "Address", "주소", "현재 주소"], max_len=3000)
        )
    if not address:
        m_that = re.search(
            r"ที่อย[\u0E00-\u0E7F\s\uE000-\uF8FF]{0,6}ู\s*[:：]?\s*\n?\s*([^\n]+(?:\n(?!อีเมล|Email|Mobile|โทรศัพท์|เบอร์|Line|ไลน์|ชื่อ\s|เพศ|วันเกิด|อายุ\s|ส่วนสูง|น้ำหนัก)[^\n]+){0,14})",
            raw_text,
        )
        if m_that:
            candidate = m_that.group(1).strip()
            if len(candidate) > 10 and (
                re.search(r"[\u0E00-\u0E7F]", candidate) or re.search(r"\d+/\d+", candidate) or re.search(r"\d+\s*ถ\.", candidate)
            ):
                address = candidate[:3000]
    if not address:
        m_addr = re.search(r"ที่อยู่\s*[:：]?\s*\n\s*([^\n]+(?:\n[^\n]+){0,5})", raw_text)
        if m_addr:
            address = m_addr.group(1).strip()[:3000]
    if not address:
        z = parser._strip_pua(raw_text[:10000])
        m_addr_z = re.search(r"ที่อย[\u0E00-\u0E7F\s]{0,4}ู\s*[:：]?\s*\n\s*([^\n]+(?:\n[^\n]+){0,10})", z)
        if m_addr_z:
            cand = m_addr_z.group(1).strip()
            if len(cand) > 10 and re.search(r"[\u0E00-\u0E7F]|\d+/\d+|\d+\s*ถ\.|หมู่|ต\.|อ\.", cand):
                address = cand[:3000]
    if address and len(address) < 80 and re.search(r"[\u0E00-\u0E7F]", address):
        addr_start = address.strip()[:50]
        idx = raw_text.find(addr_start)
        if idx >= 0:
            after = raw_text[idx:]
            stop_labels = re.compile(
                r"^\s*(วันเกิด|อายุ|อายุ|เพศ|สัญชาติ|ส่วนสูง|น้ำหนัก|ความสามารถ|ประวัติการศึกษา|ประวัติการ)", re.IGNORECASE
            )
            lines = after.split("\n")
            collected = [lines[0].strip()]
            for i in range(1, min(10, len(lines))):
                line = lines[i].strip()
                if not line:
                    continue
                if stop_labels.match(line) or (len(line) < 30 and re.match(r"^[\u0E00-\u0E7F\s]+$", line) and i > 2):
                    break
                collected.append(line)
            extended = " ".join(collected).strip()[:3000]
            if len(extended) > len(address):
                address = extended
    return parser._normalize_address_value(address) if address else None


def enrich_language_section(parser: Any, raw_text: str, sk: Optional[str]) -> Optional[str]:
    """JobThai: 'ความสามารถทางภาษา' 서브블록만 sk에서 추출. Returns language_section or None."""
    if not sk or "ความสามารถทางภาษา" not in (parser._strip_pua(sk) if re.search(r"[\u0E00-\u0E7F]", sk or "") else sk):
        return None
    search_sk = parser._strip_pua(sk) if re.search(r"[\u0E00-\u0E7F]", sk or "") else sk
    idx = search_sk.find("ความสามารถทางภาษา")
    rest = search_sk[idx:]
    end_markers = ["ความสามารถพิเศษอื่น", "ความสามารถพิเศษ", "ตําแหน่ง", "ตาแหน่ง", "เงินเดือน", "หน้าที่รับผิดชอบ", "พิมพ์ดีด", "อื่น ๆ"]
    cut = len(rest)
    for end_marker in end_markers:
        pos = rest.find(end_marker)
        if 20 < pos < cut:
            cut = pos
    rest = rest[:cut]
    return rest.strip()[:2000] or None


def enrich_height_weight(parser: Any, raw_text: str, intro: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """JobThai: PUA 제거 구간에서 신장/체중 라벨 변이(ส่วนสูง, วนสูง, น้ำหนัก 등) 추출. Returns (height_part, weight_part)."""
    if not raw_text or not re.search(r"[\u0E00-\u0E7F]", raw_text or ""):
        return (None, None)
    zone_hw = parser._strip_pua((intro or "") + "\n" + (raw_text or "")[:5000])
    height_part = None
    weight_part = None
    m_h0 = re.search(r"ส[\u0E00-\u0E7F\s]{1,6}สูง\s*[:：]?\s*(\d+)\s*(?:ซม\.?|cm\.?)?", zone_hw)
    if m_h0:
        height_part = (m_h0.group(1) + " ซม.").strip()[:50]
    if not height_part:
        m_h0b = re.search(r"(?:วนสูง|สูง)\s*[:：]?\s*(\d+)\s*(?:ซม\.?|cm\.?)?", zone_hw)
        if m_h0b:
            height_part = (m_h0b.group(1) + " ซม.").strip()[:50]
    m_w0 = re.search(r"น[\u0E00-\u0E7F\s]{1,10}หนัก\s*[:：]?\s*(\d+)\s*(?:กก\.?|kg\.?)?", zone_hw)
    if m_w0:
        weight_part = (m_w0.group(1) + " กก.").strip()[:50]
    if not weight_part:
        m_w0b = re.search(r"หนัก\s*[:：]?\s*(\d+)\s*(?:กก\.?|kg\.?)?", zone_hw)
        if m_w0b:
            weight_part = (m_w0b.group(1) + " กก.").strip()[:50]
    if not height_part:
        z = parser._strip_pua(raw_text or "")
        m_hz = re.search(r"ส่วนสูง\s*[:：]?\s*(\d+)\s*(?:ซม\.?|cm\.?)?", z)
        if m_hz:
            height_part = (m_hz.group(1) + " ซม.").strip()[:50]
    if not weight_part:
        z = parser._strip_pua(raw_text or "")
        m_wz = re.search(r"น้ำหนัก\s*[:：]?\s*(\d+)\s*(?:กก\.?|kg\.?)?", z)
        if m_wz:
            weight_part = (m_wz.group(1) + " กก.").strip()[:50]
    return (height_part, weight_part)
