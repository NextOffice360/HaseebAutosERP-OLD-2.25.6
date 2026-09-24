#!/usr/bin/env python3
"""
fetch_chrome_libs.py — Chrome shared libraries ROOT KE BAGAIR install karna.
---------------------------------------------------------------------------
Sandbox mein hum root nahi hain (apt-get lock denied), is liye:

  1. packages.debian.org se .deb URL dhoondho
  2. curl se download karo
  3. `dpkg -x` se SIRF EXTRACT karo (install nahi — root ki zaroorat nahi)
  4. LD_LIBRARY_PATH se Chrome ko wahan dekhao

Iterative: `ldd chrome | grep 'not found'` se agla missing soname pata chalta
hai, phir contents search se us ka package milta hai.

    python3 tools/fetch_chrome_libs.py
"""
import os
import re
import subprocess
import sys
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIBS = pathlib.Path(os.environ.get("CHROME_LIBS", "/home/user/.cache/chrome-libs"))
SUITE = os.environ.get("DEB_SUITE", "trixie")
CHROME = pathlib.Path(os.environ.get(
    "CHROME_BIN", "/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome"))

UA = {"User-Agent": "haseeb-autos-build/1.0 (offline lib fetch)"}


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def deb_url(pkg):
    """packages.debian.org se .deb ka direct URL nikaalo."""
    try:
        html = get(f"https://packages.debian.org/{SUITE}/amd64/{pkg}/download")
    except Exception:
        return None
    urls = re.findall(r'href="(https?://[^"]*?/%s_[^"]*?_amd64\.deb)"' % re.escape(pkg), html)
    if not urls:
        return None
    # ftp.debian.org sab se stable hota hai
    urls.sort(key=lambda u: (0 if "ftp.debian.org" in u else 1, len(u)))
    return urls[0]


def have_deb(pkg):
    return (LIBS / f".got-{pkg}").exists()


def fetch(pkg):
    if have_deb(pkg):
        return True
    url = deb_url(pkg)
    if not url:
        print(f"    ✖ {pkg}: deb URL nahi mila")
        return False
    fn = LIBS / "_debs" / (pkg + ".deb")
    fn.parent.mkdir(parents=True, exist_ok=True)
    if not fn.exists():
        r = sh(["curl", "-sL", "--max-time", "120", url, "-o", str(fn)])
        if not fn.exists() or fn.stat().st_size < 1000:
            print(f"    ✖ {pkg}: download fail")
            return False
    x = sh(["dpkg", "-x", str(fn), str(LIBS)])
    if x.returncode != 0:
        print(f"    ✖ {pkg}: extract fail — {x.stderr.strip()[:120]}")
        return False
    (LIBS / f".got-{pkg}").touch()
    symlink_libs()
    return True


def symlink_libs():
    """`dpkg -x` kabhi versioned file (libatk-1.0.so.0.25611.1) deta hai bina
    symlink ke. Chrome `libatk-1.0.so.0` dhoondhta hai → "cannot open shared
    object file". Is liye har versioned .so ke liye soname symlink banao."""
    libdir = LIBS / "usr/lib/x86_64-linux-gnu"
    if not libdir.is_dir():
        return 0
    made = 0
    for f in sorted(libdir.iterdir()):
        if not f.is_file():
            continue
        m = re.match(r"^(lib[^/]+)\.so\.(\d+)\.[\d.]+$", f.name)
        if not m:
            continue
        for link in (f"{m.group(1)}.so.{m.group(2)}", f"{m.group(1)}.so"):
            lp = libdir / link
            if not lp.exists():
                try:
                    os.symlink(f.name, lp); made += 1
                except OSError:
                    pass
    return made


def missing_sonames():
    """ldd chrome → jo libraries missing hain"""
    env = dict(os.environ, LD_LIBRARY_PATH=str(LIBS / "usr/lib/x86_64-linux-gnu"))
    r = subprocess.run(["ldd", str(CHROME)], capture_output=True, text=True, env=env)
    out = r.stdout + r.stderr
    names = []
    for line in out.splitlines():
        m = re.match(r"\s*(\S+)\s+=>\s+not found", line)
        if m:
            names.append(m.group(1))
    # ldd khud fail ho to error message se soname nikaalo
    m = re.search(r"shared libraries: (\S+):", out)
    if m and m.group(1) not in names:
        names.append(m.group(1))
    return names


def package_for_soname(soname):
    """Debian contents search → kaunsa package ye file deta hai"""
    try:
        html = get("https://packages.debian.org/search?searchon=contents&keywords=%s"
                   "&mode=exactfilename&suite=%s&arch=amd64" % (soname, SUITE))
    except Exception:
        return None
    cands = re.findall(
        r'/[a-z]+/amd64/([a-z0-9.+-]+)\s*</a>\s*</dt>\s*<dd>\s*<span[^>]*>\s*/usr/lib/x86_64-linux-gnu/%s'
        % re.escape(soname), html)
    if cands:
        return cands[0]
    # fallback: koi bhi package jis ka naam soname se shuru ho
    cands = re.findall(r'/[a-z]+/amd64/([a-z0-9.+-]+)\s*</a>', html)
    for c in cands:
        if c.split(":")[0].startswith(soname.split(".")[0][:4]):
            return c
    return cands[0] if cands else None


def main():
    LIBS.mkdir(parents=True, exist_ok=True)
    print(f"Chrome libs → {LIBS}   (suite: {SUITE})")

    # starter set — Chrome ke jaane-pehchane deps
    STARTER = ["libnspr4", "libnss3", "libatk1.0-0t64", "libatk-bridge2.0-0t64",
               "libcups2t64", "libdrm2", "libxkbcommon0", "libxcomposite1",
               "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1",
               "libpango-1.0-0", "libcairo2", "libasound2t64"]
    print("\n[1] starter packages download + extract")
    for p in STARTER:
        print(f"    • {p}", end=" ", flush=True)
        print("ok" if fetch(p) else "FAIL")

    print("\n[2] iterative: missing sonames → package → download")
    for round_no in range(1, 13):
        miss = missing_sonames()
        if not miss:
            print(f"    ✔ round {round_no}: koi missing library nahi")
            break
        print(f"    round {round_no}: {len(miss)} missing → {miss[:6]}")
        done = False
        for soname in miss:
            pkg = package_for_soname(soname)
            if not pkg:
                print(f"      ✖ {soname}: package nahi mila")
                continue
            print(f"      • {soname} → {pkg}", end=" ", flush=True)
            print("ok" if fetch(pkg) else "FAIL")
            done = True
        if not done:
            print("    ✖ koi aur package nahi mil saka — yahin ruke hain")
            break

    print(f"\n[2b] symlinks (versioned .so → soname): {symlink_libs()} banaye")

    print("\n[3] ab Chrome chala kar dekhte hain")
    env = dict(os.environ, LD_LIBRARY_PATH=str(LIBS / "usr/lib/x86_64-linux-gnu"))
    r = subprocess.run([str(CHROME), "--version"], capture_output=True, text=True, env=env)
    v = (r.stdout or r.stderr).strip().splitlines()[:1]
    print("    chrome --version →", v[0] if v else r.stderr.strip()[:200])
    ok = bool(v) and "error while loading" not in (v[0] if v else "")
    print("\n" + ("✔ CHROME TAIYAR HAI" if ok else "✖ Chrome abhi bhi nahi chal raha"))
    if ok:
        print(f"   export LD_LIBRARY_PATH={LIBS}/usr/lib/x86_64-linux-gnu")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
