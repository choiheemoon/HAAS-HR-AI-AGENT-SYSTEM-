"""HTML 문자열을 Chromium(Playwright)으로 PDF로 렌더링합니다.

배포 후 최초 1회: `python -m playwright install chromium`
(또는 CI/서버 스크립트에서 동일 명령 실행)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def write_html_as_pdf(
    path: str,
    html: str,
    *,
    timeout_ms: int = 180_000,
) -> str:
    """완전한 HTML 문서 문자열을 A4 PDF로 저장합니다."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError(
            "Playwright가 설치되지 않았습니다. pip install playwright 후 "
            "python -m playwright install chromium 을 실행하세요."
        ) from e

    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_default_timeout(timeout_ms)
            # 로컬 HTML + 인라인 SVG: 외부 네트워크 없음
            page.set_content(html, wait_until="load")
            page.pdf(
                path=str(out.resolve()),
                format="A4",
                print_background=True,
                margin={"top": "12mm", "right": "12mm", "bottom": "12mm", "left": "12mm"},
            )
        finally:
            browser.close()

    return str(out)


def try_write_html_as_pdf(path: str, html: str, *, timeout_ms: int = 180_000) -> Optional[str]:
    """성공 시 경로, 실패 시 None (로그만 남김)."""
    try:
        return write_html_as_pdf(path, html, timeout_ms=timeout_ms)
    except Exception:
        logger.exception("HTML→PDF(Playwright) 렌더 실패, 폴백 사용 가능")
        return None
