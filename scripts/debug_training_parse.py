# -*- coding: utf-8 -*-
"""Debug training/cert parsing on JobThai reference TXT."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.recruitment.resume_parser import ResumeParser
from app.services.recruitment.resume_parser.forms import jobthai

path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "JobThai - 3150864_จันธเสม_ศิริรัตน์ - Application CMM.txt")
if not os.path.isfile(path):
    path = "JobThai - 3150864_จันธเสม_ศิริรัตน์ - Application CMM.txt"

p = ResumeParser()
raw_text = p.extract_text(path)
form_type = p.detect_form_type(raw_text, "JobThai - 3150864.txt")
sections = p._extract_sections(raw_text)
training_section = (sections.get("training") or "").strip() or None
cert_section = (sections.get("certification") or "").strip() or None
zone_t = p._strip_pua(raw_text)

# Simulate the merge logic
if form_type == 2 and "หลักสูตร" in zone_t:
    import re
    m_t = re.search(
        r"(?:ประวัติการฝ[\u0E00-\u0E7F]*?กอบรม|ประวัติการฝึกอบรม)[^\n]*(?:[\s\S]{50,15000}?)(?=ความสามารถ\s|หลักสูตรและการฝึก|\Z)",
        zone_t,
    )
    if m_t:
        training_section = (training_section or "") + "\n\n" + m_t.group(0).strip()
    # scattered block
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
            p_pos = chunk.find(end_m)
            if 200 < p_pos < len(chunk):
                chunk = chunk[:p_pos]
                break
        import re as re2
        m_duty = re2.search(r"\n\s*-\s+[\u0E00-\u0E7F\w]", chunk[200:])
        if m_duty and m_duty.start() > 100:
            chunk = chunk[: 200 + m_duty.start()]
        if "ประกาศนียบัตร" in chunk or "วุฒิบัตร" in chunk:
            training_section = (training_section or "") + "\n\n" + chunk.strip()

training_cert_merged = "\n\n".join(filter(None, [training_section, cert_section]))
entries = jobthai.parse_training_cert_entries_jobthai(p, training_cert_merged) if training_cert_merged and form_type == 2 else []

with open(os.path.join(os.path.dirname(__file__), "debug_training_out.txt"), "w", encoding="utf-8") as f:
    f.write("form_type=%s\n" % form_type)
    f.write("len(raw_text)=%s\n" % len(raw_text or ""))
    f.write("training_section len=%s\n" % len(training_section or ""))
    f.write("cert_section len=%s\n" % len(cert_section or ""))
    f.write("training_cert_merged len=%s\n" % len(training_cert_merged))
    f.write("entries count=%s\n" % len(entries))
    for i, e in enumerate(entries):
        f.write("\n--- %s ---\n" % (i+1))
        f.write("institution: %s\n" % (e.get("institution") or ""))
        f.write("period: %s\n" % (e.get("period") or ""))
        f.write("course: %s\n" % (e.get("course") or ""))
        f.write("certificate: %s\n" % (e.get("certificate") or ""))

print("Wrote debug_training_out.txt", "entries:", len(entries))
