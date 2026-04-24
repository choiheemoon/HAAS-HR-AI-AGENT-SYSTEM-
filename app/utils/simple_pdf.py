"""외부 라이브러리 없이 간단한 PDF 생성."""
from pathlib import Path
from typing import Iterable
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _escape_pdf_text(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_simple_text_pdf(path: str, title: str, lines: Iterable[str]) -> str:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    text_lines = [title, ""] + [str(x) for x in lines]
    y = 780
    commands = ["BT", "/F1 12 Tf", "50 800 Td", f"({_escape_pdf_text(title)}) Tj"]
    for line in text_lines[1:]:
        y -= 16
        if y < 40:
            break
        commands.append(f"1 0 0 1 50 {y} Tm ({_escape_pdf_text(line)}) Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", errors="ignore")

    objects = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
    objects.append(
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
    )
    objects.append(
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
    )
    objects.append(
        f"5 0 obj << /Length {len(stream)} >> stream\n".encode("ascii")
        + stream
        + b"\nendstream endobj\n"
    )

    content = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(content))
        content += obj
    xref_pos = len(content)
    content += f"xref\n0 {len(offsets)}\n".encode("ascii")
    content += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        content += f"{off:010d} 00000 n \n".encode("ascii")
    content += (
        f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "ascii"
        )
    )

    out.write_bytes(content)
    return str(out)


def _fmt_num(v: Any) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, int):
        return f"{v:,}"
    if isinstance(v, float):
        if v.is_integer():
            return f"{int(v):,}"
        return f"{v:,.1f}"
    s = str(v).strip()
    if not s:
        return "-"
    return s


def write_hr_report_pdf(path: str, summary: Dict[str, Any], company_name: str, period_type: str, months: int) -> str:
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="HR Scheduled Report",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#1d4ed8"))
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#0f172a"))
    meta_style = ParagraphStyle("meta", parent=styles["BodyText"], fontSize=9, textColor=colors.HexColor("#334155"))

    totals = summary.get("totals") or {}
    monthly = summary.get("monthly_trend") or []
    by_department = summary.get("by_department") or []
    by_emp_type = summary.get("by_employment_type") or []
    by_work_status = summary.get("by_work_status") or []
    as_of = str(summary.get("as_of") or "-")

    story: List[Any] = []
    story.append(Paragraph("HR Report", title_style))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"Company: <b>{company_name}</b> / Period: <b>{period_type}</b> / Trend Months: <b>{months}</b> / As of: <b>{as_of}</b>",
            meta_style,
        )
    )
    story.append(Spacer(1, 5 * mm))

    kpi_rows = [
        ["Metric", "Value"],
        ["Active Employees", _fmt_num(totals.get("employees_active", 0))],
        ["All Employees", _fmt_num(totals.get("employees_all", 0))],
    ]
    kpi_table = Table(kpi_rows, colWidths=[80 * mm, 80 * mm])
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ]
        )
    )
    story.append(Paragraph("Summary KPI", h2_style))
    story.append(Spacer(1, 2 * mm))
    story.append(kpi_table)
    story.append(Spacer(1, 5 * mm))

    def _section_table(title: str, headers: List[str], rows: List[List[Any]]) -> None:
        story.append(Paragraph(title, h2_style))
        story.append(Spacer(1, 2 * mm))
        table_data: List[List[str]] = [headers] + [[_fmt_num(v) for v in r] for r in rows[:30]]
        if len(table_data) == 1:
            table_data.append(["No data"] + [""] * (len(headers) - 1))
        tbl = Table(table_data, repeatRows=1)
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 5 * mm))

    _section_table(
        "Monthly Headcount / Hires / Terminations",
        ["Year-Month", "Headcount", "Hires", "Terminations"],
        [[r.get("year_month"), r.get("headcount"), r.get("hires"), r.get("terminations")] for r in monthly],
    )
    _section_table(
        "Department Distribution",
        ["Department", "Headcount"],
        [[r.get("department"), r.get("headcount")] for r in by_department],
    )
    _section_table(
        "Employment Type Distribution",
        ["Type", "Count"],
        [[r.get("label"), r.get("count")] for r in by_emp_type],
    )
    _section_table(
        "Work Status Distribution",
        ["Status", "Count"],
        [[r.get("label"), r.get("count")] for r in by_work_status],
    )

    doc.build(story)
    return str(out)
