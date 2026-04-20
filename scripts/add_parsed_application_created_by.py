#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Add created_by_id column to parsed_applications. Run once: python scripts/add_parsed_application_created_by.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from app.database import engine


def main():
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE parsed_applications ADD COLUMN IF NOT EXISTS created_by_id INTEGER NULL"))
        conn.commit()
    print("OK: parsed_applications.created_by_id column added (or already exists).")


if __name__ == "__main__":
    main()
