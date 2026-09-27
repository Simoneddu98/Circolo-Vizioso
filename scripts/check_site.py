"""Controlla una cartella del sito statico: ogni import JS e ogni asset caricato dal codice esiste con il nome esatto
(maiuscole comprese). Uso: python3 scripts/check_site.py consegna/netlify-circolo"""
import os, re, sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(root)


def exact(path):
    cur = "."
    for p in os.path.normpath(path).split(os.sep):
        if p in (".", ""):
            continue
        if p == "..":
            cur = os.path.dirname(cur)
            continue
        if not os.path.isdir(cur) or p not in os.listdir(cur):
            return False
        cur = os.path.join(cur, p)
    return True


imap = {"three": "vendor/three/build/three.module.js", "three/addons/": "vendor/three/examples/jsm/"}
bad, n = [], 0
js = [os.path.join(d, f) for d, _, fs in os.walk(".") for f in fs if f.endswith(".js")]
for f in js + ["index.html"]:
    t = open(f, errors="ignore").read()
    for m in re.finditer(r"""(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]""", t):
        spec = m.group(1)
        if spec == "three":
            p = imap["three"]
        elif spec.startswith("three/addons/"):
            p = imap["three/addons/"] + spec[len("three/addons/"):]
        elif spec.startswith("."):
            p = os.path.join(os.path.dirname(f), spec)
        else:
            continue
        n += 1
        if not exact(p):
            bad.append(f"{f}: {spec}")
    if f.startswith("./vendor"):
        continue                                       # i commenti di three.js citano file d'esempio
    for m in re.finditer(r"""['"`]\.?/?(assets/[\w./-]+?)(?:\?[^'"`]*)?['"`]""", t):
        p = m.group(1)
        if p.endswith("partita.mp4"):
            continue                                   # video facoltativo
        n += 1
        if not exact(p):
            bad.append(f"{f}: {p}")
print(f"controllati {n} riferimenti")
if bad:
    print("MANCANTI:\n  " + "\n  ".join(bad))
    sys.exit(1)
print("ok: nessun file mancante")
