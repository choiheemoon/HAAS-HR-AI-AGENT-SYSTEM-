from pathlib import Path

root = Path(__file__).resolve().parent
inserts = [
    (
        root / "frontend" / "i18n" / "locales" / "ko.ts",
        "  'appList.filter.search': '\uac80\uc0c9',\n",
    ),
    (
        root / "frontend" / "i18n" / "locales" / "th.ts",
        "  'appList.filter.search': '\u0e04\u0e49\u0e19\u0e2b\u0e32',\n",
    ),
]
for p, line in inserts:
    text = p.read_text(encoding="utf-8")
    needle = "  'appList.filter.refresh':"
    if "appList.filter.search" in text:
        print("skip (exists)", p.name)
        continue
    if needle not in text:
        raise SystemExit(f"refresh line not found: {p}")
    text = text.replace(needle, line + needle, 1)
    p.write_text(text, encoding="utf-8")
    print("ok", p.name)
