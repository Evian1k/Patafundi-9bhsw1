#!/usr/bin/env python3
"""Replace the em/en dash character in USER-VISIBLE strings with a plain hyphen.

Scope (Task: user reported still seeing the dash sign in the UI):
  1. frontend/src lines listed in /tmp/emdash_full.txt (non-comment em dashes),
     minus the lines already hand-fixed with honest text.
  2. backend/scripts/seed-takeover.js + backend/migrations/040_policy_content.sql
     (demo data & policy text that render in the UI).
  3. frontend/index.html (title / meta description).
  4. En-dash spots in FundiWallet.tsx / CreateJob.tsx.
  5. Mobile apps: visible strings in apps/*/src.
Comments are skipped where practical (a changed comment is harmless but noisy).
"""
import pathlib
import re

ROOT = pathlib.Path("/home/z/my-project")
EM = "\u2014"  # —
EN = "\u2013"  # –


def replace_on_lines(path: pathlib.Path, line_nums, chars=(EM,)):
    text = path.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = 0
    for n in line_nums:
        if 1 <= n <= len(text):
            old = text[n - 1]
            new = old
            for c in chars:
                new = new.replace(c, "-")
            if new != old:
                text[n - 1] = new
                changed += 1
    path.write_text("".join(text), encoding="utf-8")
    return changed


def replace_everywhere(path: pathlib.Path, chars=(EM,), skip_comment_lines=True):
    text = path.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = 0
    comment_re = re.compile(r"^\s*(//|/\*|\*|\{/\*)")
    for i, old in enumerate(text):
        if skip_comment_lines and comment_re.match(old):
            continue
        new = old
        for c in chars:
            new = new.replace(c, "-")
        if new != old:
            text[i] = new
            changed += 1
    path.write_text("".join(text), encoding="utf-8")
    return changed


def main():
    total = 0

    # 1. Web frontend: lines from the audit dump, minus hand-fixed ones.
    exclude = {
        ("frontend/src/pages/admin/Dashboard.tsx", 235),
        ("frontend/src/components/fundi/JobRequestModal.tsx", 63),
        ("frontend/src/components/fundi/JobRequestModal.tsx", 68),
        ("frontend/src/components/maps/FundiNavigationMap.tsx", 50),
        ("frontend/src/components/fundi/FundiTracker.tsx", 631),
        ("frontend/src/pages/company/PortalFinance.tsx", 140),
        ("frontend/src/pages/HelpCenter.tsx", 58),
    }
    by_file = {}
    for raw in pathlib.Path("/tmp/emdash_full.txt").read_text().splitlines():
        m = re.match(r"^(frontend/src/[^:]+):(\d+):", raw)
        if not m:
            continue
        key = (m.group(1), int(m.group(2)))
        if key in exclude:
            continue
        by_file.setdefault(m.group(1), set()).add(int(m.group(2)))
    for rel, nums in sorted(by_file.items()):
        total += replace_on_lines(ROOT / rel, sorted(nums))
        print(f"web  {rel}: {len(nums)} line(s) targeted")

    # 2. Seed demo data + policy content (rendered in UI).
    total += replace_everywhere(ROOT / "backend/scripts/seed-takeover.js")
    print("seed seed-takeover.js cleaned")
    total += replace_everywhere(ROOT / "backend/migrations/040_policy_content.sql")
    print("seed 040_policy_content.sql cleaned")

    # 3. index.html (tab title + meta description).
    total += replace_everywhere(ROOT / "frontend/index.html")
    print("web  index.html cleaned")

    # 4. En-dash spots.
    total += replace_on_lines(ROOT / "frontend/src/pages/FundiWallet.tsx", [247], (EN,))
    total += replace_on_lines(ROOT / "frontend/src/pages/CreateJob.tsx", [645], (EN,))
    print("web  en-dash spots cleaned")

    # 5. Mobile apps: visible strings only.
    for app in ("customer-mobile", "fundi-mobile"):
        for f in (ROOT / f"apps/{app}/src").rglob("*.tsx"):
            total += replace_everywhere(f, (EM, EN))
        for f in (ROOT / f"apps/{app}/src").rglob("*.ts"):
            total += replace_everywhere(f, (EM, EN))
    print("mobile apps cleaned")

    print(f"DONE - {total} line(s) changed")


if __name__ == "__main__":
    main()
