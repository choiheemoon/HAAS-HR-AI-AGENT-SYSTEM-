"""외부 라이브러리 없이 간단한 PDF 생성."""
from pathlib import Path
from typing import Iterable


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
