# -*- coding: utf-8 -*-
"""이력서 파일에서 텍스트·이미지 추출 (PDF/DOCX/TXT)."""
import base64
import os
from typing import Optional

from PyPDF2 import PdfReader
from docx import Document


def extract_from_pdf(file_path: str) -> str:
    """PDF에서 텍스트 추출 (UTF-8 등 다국어 지원)."""
    text = ""
    try:
        reader = PdfReader(file_path)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    except Exception as e:
        raise ValueError(f"PDF 파싱 오류: {str(e)}")
    return text


def extract_photo_from_pdf(file_path: str, max_pages: int = 3) -> Optional[str]:
    """PDF에서 첫 몇 페이지 이미지 추출 → base64 데이터 URL 또는 None."""
    try:
        reader = PdfReader(file_path)
        best_data: Optional[bytes] = None
        best_size = 0
        ext = "jpg"
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            try:
                for img in page.images:
                    try:
                        data = getattr(img, "data", None)
                        if not data or len(data) > 5 * 1024 * 1024:
                            continue
                        if len(data) > best_size:
                            best_size = len(data)
                            best_data = data
                            name = (getattr(img, "name", None) or "").lower()
                            ext = "png" if ".png" in name else "jpg"
                    except Exception:
                        continue
            except (AttributeError, Exception):
                continue
        if best_data:
            mime = "image/png" if ext == "png" else "image/jpeg"
            b64 = base64.b64encode(best_data).decode("ascii")
            return f"data:{mime};base64,{b64}"
    except Exception:
        pass
    return None


def extract_from_docx(file_path: str) -> str:
    """DOCX에서 텍스트 추출."""
    text = ""
    try:
        doc = Document(file_path)
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
    except Exception as e:
        raise ValueError(f"DOCX 파싱 오류: {str(e)}")
    return text


def extract_from_txt(file_path: str) -> str:
    """TXT에서 텍스트 추출 (utf-8, utf-8-sig, cp949, utf-16 시도)."""
    for enc in ("utf-8", "utf-8-sig", "cp949", "utf-16"):
        try:
            with open(file_path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, OSError):
            continue
    raise ValueError("TXT 파일 인코딩을 읽을 수 없습니다.")


def extract_text(file_path: str) -> str:
    """파일 확장자에 따라 PDF/DOCX/TXT에서 텍스트 추출."""
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext == ".pdf":
        return extract_from_pdf(file_path)
    if file_ext in (".doc", ".docx"):
        return extract_from_docx(file_path)
    if file_ext == ".txt":
        return extract_from_txt(file_path)
    raise ValueError(f"지원하지 않는 파일 형식: {file_ext}")
