#!/usr/bin/env python3
"""
fix_chrome_libs.py — ${CHROME_LIBS:-/home/user/.cache/chrome-libs} ke andar missing
SONAME symlinks dobara banao.

----------------------------------------------------------------------------
Kyun zaroori hai (2026-09-24 ko asli masla bana):
  Sandbox mein root nahi hote, is liye Chrome ki shared libs
  `tools/fetch_chrome_libs.py` se SIRF EXTRACT hoti hain aur
  LD_LIBRARY_PATH se milti hain. Magar workspace snapshot symlinks ko
  preserve nahi karta — files rehti hain (`libatk-1.0.so.0.25611.1`) aur
  unke SONAME naam (`libatk-1.0.so.0`) GAYAB ho jate hain. Us halat mein:

      chrome: error while loading shared libraries: libatk-1.0.so.0

  aur poore browser gates "FATAL Error: Failed to launch the browser process"
  se gir jate hain (test ka kasoor nahi).

Ilaj: har `<name>.so.X[.Y[.Z]]` file ke liye `<name>.so.X` (aur `<name>.so`)
symlink bana do — idempotent, root ki zaroorat nahi.

    python3 tools/fix_chrome_libs.py
"""
import os
import pathlib
import re
import sys

LIBS = pathlib.Path(os.environ.get("CHROME_LIBS", "/home/user/.cache/chrome-libs"))
DIR = LIBS / "usr" / "lib" / "x86_64-linux-gnu"
PAT = re.compile(r"^(?P<base>lib[^/]+?)\.so(?:\.(?P<ver>[0-9][0-9.]*))?$")


def main() -> int:
    if not DIR.is_dir():
        print(f"  (chrome libs dir nahi mila: {DIR} — skip)")
        return 0
    made = 0
    checked = 0
    for f in sorted(DIR.iterdir()):
        m = PAT.match(f.name)
        if not m or not f.is_file():
            continue
        base, ver = m.group("base"), m.group("ver") or ""
        checked += 1
        if ver:
            soname = f"{base}.so.{ver.split('.')[0]}"      # libatk-1.0.so.0
            link = DIR / soname
            if not link.exists():
                try:
                    link.symlink_to(f.name)
                    made += 1
                except FileExistsError:
                    pass
        link2 = DIR / f"{base}.so"
        if not link2.exists():
            try:
                link2.symlink_to(f.name)
                made += 1
            except FileExistsError:
                pass
    print(f"  ✔ chrome libs: {checked} files checked, {made} symlink(s) banaye ({DIR})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
