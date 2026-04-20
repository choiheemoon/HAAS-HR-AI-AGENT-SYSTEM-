"""직원 사진 파일 저장(STORAGE_PATH 하위). 업로드는 JPEG 변환·리사이즈·썸네일 생성."""
from __future__ import annotations

import asyncio
import io
import re
from pathlib import Path
from typing import Optional, Tuple

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

# 업로드 원본 최대 크기(처리 전)
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
# 본 이미지: 긴 변 기준
MAIN_MAX_SIDE_PX = 500
# 목록 썸네일: 긴 변 기준
THUMB_MAX_SIDE_PX = 150
JPEG_QUALITY_MAIN = 85
JPEG_QUALITY_THUMB = 78

_THUMB_SUBDIR = "thumbnails"

# 응답/로그용
_EXT_TO_MEDIA = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _storage_root(storage_path: str) -> Path:
    return Path(storage_path).resolve()


def relative_photo_dir() -> str:
    return "employee_photos"


def sanitize_company_folder_segment(raw: str, *, fallback: str = "_unknown") -> str:
    """
    회사코드 등 단일 경로 세그먼트로 쓸 문자열 정규화(경로 침입·예약 문자 제거).
    """
    t = (raw or "").strip()
    if not t:
        return fallback
    t = re.sub(r'[\x00-\x1f<>:"|?*\\/]', "_", t)
    t = t.strip("._") or fallback
    if t in (".", ".."):
        return fallback
    return t[:120]


def media_type_for_path(rel_path: str) -> str:
    ext = Path(rel_path).suffix.lower()
    return _EXT_TO_MEDIA.get(ext, "application/octet-stream")


def thumb_relative_path_from_main(main_rel: Optional[str]) -> Optional[str]:
    """본 이미지 상대경로 → 썸네일 상대경로 (항상 동일 파일명, thumbnails 하위)."""
    if not main_rel:
        return None
    p = Path(main_rel.replace("\\", "/"))
    if p.parent.name == _THUMB_SUBDIR:
        return main_rel.replace("\\", "/")
    return str(p.parent / _THUMB_SUBDIR / p.name).replace("\\", "/")


async def read_upload_bytes(upload: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ValueError("이미지 크기는 2MB 이하여야 합니다.")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise ValueError("파일이 비어 있습니다.")
    return data


def _to_rgb(im: Image.Image) -> Image.Image:
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        return bg
    if im.mode == "P":
        return _to_rgb(im.convert("RGBA"))
    return im.convert("RGB")


def _resize_max_side(im: Image.Image, max_side: int) -> Image.Image:
    w, h = im.size
    m = max(w, h)
    if m <= max_side:
        return im
    scale = max_side / m
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def save_employee_photo_processed_sync(
    raw: bytes,
    *,
    storage_path: str,
    employee_id: int,
    company_folder: str,
) -> Tuple[str, str]:
    """
    원본 바이트 → RGB JPEG 본편(500px) + 썸네일(150px) 저장.
    반환: (main_rel, thumb_rel)
    """
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("이미지를 읽을 수 없습니다. (jpg, png, webp 등)") from e

    im = ImageOps.exif_transpose(im)
    base = _to_rgb(im)

    main_img = _resize_max_side(base, MAIN_MAX_SIDE_PX)
    thumb_img = _resize_max_side(base.copy(), THUMB_MAX_SIDE_PX)

    seg = sanitize_company_folder_segment(company_folder)
    root = _storage_root(storage_path) / relative_photo_dir() / seg
    thumb_dir = root / _THUMB_SUBDIR
    root.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    final_name = f"{employee_id}.jpg"
    main_abs = root / final_name
    thumb_abs = thumb_dir / final_name

    try:
        main_img.save(main_abs, format="JPEG", quality=JPEG_QUALITY_MAIN, optimize=True)
        thumb_img.save(thumb_abs, format="JPEG", quality=JPEG_QUALITY_THUMB, optimize=True)
    except OSError as e:
        for p in (main_abs, thumb_abs):
            try:
                if p.is_file():
                    p.unlink()
            except OSError:
                pass
        raise ValueError("이미지 저장에 실패했습니다.") from e

    rel_main = f"{relative_photo_dir()}/{seg}/{final_name}".replace("\\", "/")
    rel_thumb = f"{relative_photo_dir()}/{seg}/{_THUMB_SUBDIR}/{final_name}".replace("\\", "/")
    return rel_main, rel_thumb


async def save_employee_photo_file(
    *,
    storage_path: str,
    employee_id: int,
    company_folder: str,
    upload: UploadFile,
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> Tuple[str, str]:
    """업로드 스트림 읽기(용량 제한) 후 JPEG 본편·썸네일 저장. (main_rel, thumb_rel)"""
    raw = await read_upload_bytes(upload, max_bytes=max_bytes)
    return await asyncio.to_thread(
        save_employee_photo_processed_sync,
        raw,
        storage_path=storage_path,
        employee_id=employee_id,
        company_folder=company_folder,
    )


def delete_photo_file_if_exists(storage_path: str, relative_path: Optional[str]) -> None:
    if not relative_path:
        return
    p = _storage_root(storage_path) / relative_path.replace("\\", "/")
    try:
        if p.is_file():
            p.unlink()
    except OSError:
        pass


def delete_employee_photo_pair(storage_path: str, main_relative: Optional[str]) -> None:
    """본편 + 회사폴더 규칙의 썸네일 파일 삭제."""
    delete_photo_file_if_exists(storage_path, main_relative)
    thumb = thumb_relative_path_from_main(main_relative)
    if thumb and thumb != main_relative:
        delete_photo_file_if_exists(storage_path, thumb)


def absolute_file_path(storage_path: str, relative_path: Optional[str]) -> Optional[Path]:
    if not relative_path:
        return None
    p = _storage_root(storage_path) / relative_path.replace("\\", "/")
    return p if p.is_file() else None
