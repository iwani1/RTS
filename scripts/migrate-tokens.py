#!/usr/bin/env python3
"""
One-off token migration: rewrites the legacy Tailwind palette classes in the
application source onto the design-system tokens in globals.css.

Runs once against the pre-rebuild tree. Safe to re-run — every rule is
idempotent because the output no longer contains the legacy names.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Ordered longest-first within each family so compound rules win.
TEXT = [
    ("text-slate-800 dark:text-slate-200", "text-ink"),
    ("text-slate-900 dark:text-slate-100", "text-ink"),
    ("text-slate-700 dark:text-slate-300", "text-ink"),
    ("text-slate-600 dark:text-slate-300", "text-ink-2"),
    ("text-slate-500 dark:text-slate-400", "text-ink-2"),
    ("text-slate-400 dark:text-slate-300", "text-ink-2"),
    ("text-slate-500", "text-ink-2"),
    ("text-slate-400", "text-ink-3"),
    ("text-slate-600", "text-ink-2"),
    ("text-slate-700", "text-ink"),
    ("text-slate-800", "text-ink"),
    ("text-slate-900", "text-ink"),
    ("text-slate-300", "text-ink-2"),
    ("text-slate-100", "text-ink"),
    ("text-navy-900 dark:text-white", "text-ink"),
    ("text-navy-800", "text-ink"),
    ("text-navy-700", "text-ink"),
    ("text-teal-700 dark:text-teal-400", "text-signal-text"),
    ("text-teal-600", "text-signal-text"),
    ("text-teal-700", "text-signal-text"),
    ("text-emerald-600", "text-st-ok"),
    ("text-emerald-700", "text-st-ok"),
    ("text-rose-600", "text-st-critical"),
    ("text-rose-700", "text-st-critical"),
    ("text-amber-600", "text-st-caution"),
    ("text-amber-700", "text-st-caution"),
    ("text-amber-800 dark:text-amber-200", "text-st-caution"),
    ("text-amber-800", "text-st-caution"),
    ("text-amber-900", "text-st-caution"),
    ("text-blue-600", "text-st-live"),
    ("text-blue-700", "text-st-live"),
    ("text-green-600", "text-st-ok"),
    ("text-red-600", "text-st-critical"),
]

BG = [
    ("bg-slate-50 dark:bg-slate-950 dark:text-slate-300", "bg-surface-2 text-ink-2"),
    ("bg-slate-50 dark:bg-slate-950", "bg-surface-2"),
    ("bg-slate-50", "bg-surface-2"),
    ("bg-slate-100", "bg-surface-2"),
    ("bg-slate-200", "bg-surface-3"),
    ("bg-white dark:bg-slate-900", "bg-surface-1"),
    ("bg-white", "bg-surface-1"),
    ("bg-navy-800 dark:bg-teal-600", "bg-signal text-signal-ink"),
    ("bg-navy-800", "bg-signal text-signal-ink"),
    ("bg-navy-900", "bg-signal text-signal-ink"),
    ("bg-teal-600", "bg-signal text-signal-ink"),
    ("bg-teal-700", "bg-signal text-signal-ink"),
    ("bg-teal-50", "bg-signal-wash"),
    ("bg-emerald-50", "bg-st-ok/10"),
    ("bg-emerald-600", "bg-st-ok"),
    ("bg-rose-50", "bg-st-critical/10"),
    ("bg-rose-600", "bg-st-critical"),
    ("bg-amber-50 dark:bg-amber-950/40", "bg-st-caution/10"),
    ("bg-amber-50", "bg-st-caution/10"),
    ("bg-amber-200", "bg-st-caution/20"),
    ("bg-amber-600", "bg-st-caution"),
    ("bg-blue-50", "bg-st-live/10"),
    ("bg-blue-600", "bg-st-live"),
    ("bg-green-500", "bg-st-ok"),
    ("bg-red-500", "bg-st-critical"),
    ("bg-gray-50", "bg-surface-2"),
    ("bg-gray-100", "bg-surface-2"),
    ("bg-gray-900", "bg-surface-1"),
]

BORDER = [
    ("border-slate-200 dark:border-slate-800", "border-line"),
    ("border-slate-300 dark:border-slate-700", "border-line-strong"),
    ("border-slate-200", "border-line"),
    ("border-slate-300", "border-line-strong"),
    ("border-slate-100", "border-line"),
    ("border-navy-800", "border-signal"),
    ("border-teal-600", "border-signal"),
    ("border-amber-200 dark:border-amber-800", "border-st-caution/30"),
    ("border-amber-200", "border-st-caution/30"),
    ("border-emerald-200", "border-st-ok/30"),
    ("border-rose-200", "border-st-critical/30"),
    ("border-gray-200", "border-line"),
    ("border-gray-300", "border-line-strong"),
]

DIVIDE = [
    ("divide-slate-100 dark:divide-slate-800", "divide-line"),
    ("divide-slate-200", "divide-line"),
    ("divide-gray-200", "divide-line"),
]

RING = [
    ("ring-slate-200", "ring-line"),
    ("ring-gray-200", "ring-line"),
]

MISC = [
    ("rounded-xl", "rounded-[8px]"),
    ("rounded-lg", "rounded-[8px]"),
    ("shadow-sm", ""),
    ("shadow-md", ""),
    ("shadow-lg", ""),
    ("shadow-xl", ""),
    ("dark:bg-slate-800/90", "bg-surface-1/92"),
    ("dark:bg-slate-800", "bg-surface-2"),
    ("dark:bg-slate-900/85", "bg-surface-1/92"),
    ("dark:bg-slate-950", "bg-surface-1"),
    ("dark:border-slate-700", "border-line-strong"),
    ("dark:border-slate-800", "border-line"),
    ("dark:text-slate-200", "text-ink"),
    ("dark:text-slate-300", "text-ink-2"),
    ("dark:text-slate-400", "text-ink-3"),
    ("dark:text-slate-500", "text-ink-3"),
    ("dark:bg-slate-700", "bg-surface-3"),
    ("dark:bg-slate-600", "bg-surface-3"),
    ("tabular-nums", "numeric"),
    ("font-mono", "numeric"),
]

RULES = TEXT + BG + BORDER + DIVIDE + RING + MISC

# class names to strip entirely (they leave a double space behind)
STRIP = {"shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"}

TOKEN = re.compile(r"\b(?:text|bg|border|divide|ring)-(?:slate|gray|navy|teal|emerald|rose|amber|blue|green|red)-\d{2,3}\b")
DARK = re.compile(r"^dark:")


def migrate(text: str) -> tuple[str, bool]:
    original = text
    for old, new in RULES:
        text = text.replace(old, new)
    # any remaining palette token that was not covered by a compound rule
    def repl(match: re.Match) -> str:
        token = match.group(0)
        if DARK.match(token):
            return token
        prefix, shade = token.rsplit("-", 1)
        if prefix == "text":
            return {"text-slate-50": "text-ink-3"}.get(token, "text-ink-2")
        if prefix == "bg":
            return "bg-surface-2"
        if prefix == "border":
            return "border-line"
        if prefix == "divide":
            return "divide-line"
        return token

    text = TOKEN.sub(repl, text)
    # collapse the double spaces left by removed shadows
    text = re.sub(r'className="([^"]*)"', lambda m: 'className="' + re.sub(r"\s{2,}", " ", m.group(1)).strip() + '"', text)
    text = re.sub(r"\{\s*\n\s*\}", "{}", text)
    return text, text != original


def main() -> int:
    changed = []
    for path in sorted(ROOT.glob("src/**/*.tsx")) + sorted(ROOT.glob("src/**/*.ts")):
        source = path.read_text()
        updated, did = migrate(source)
        if did:
            path.write_text(updated)
            changed.append(str(path.relative_to(ROOT)))
    print(f"migrated {len(changed)} files")
    for name in changed:
        print(" ", name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
