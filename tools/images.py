#!/usr/bin/env python3
"""Illustrations des leçons, générées en local par Draw Things (FLUX.1 schnell).

Prérequis : Draw Things ouvert, API Server en HTTP, port 7860, limité à 127.0.0.1.
Bibliothèque standard uniquement : rien à installer.

Usage :
  python3 tools/images.py try <leçon> <clé> [graines…]  # variantes dans ~/.revisions-cm1/img/variants
  python3 tools/images.py pick <leçon> <clé> <graine>   # retient une variante (graine notée dans la leçon)
  python3 tools/images.py                               # génère les images retenues manquantes

Les prompts sont dans lessons/<leçon>.json, champ "images" : { clé: { prompt, w, h, seed? } }.
Les compagnons (œufs, dragons, licorne…) : lessons/companions.json, « leçon » `companions`,
champ "images" de chaque espèce (clés <espèce>0 … <espèce>4).
Sortie : lessons/img/<leçon>/<clé>.jpg + lessons/img/manifest.json
"""
import base64
import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
IMG = LESSONS / "img"
WORK = pathlib.Path.home() / ".revisions-cm1" / "img"
API = "http://127.0.0.1:7860/sdapi/v1/txt2img"
STYLE = (ROOT / "tools" / "style.txt").read_text(encoding="utf-8").strip()
NEGATIVE = "text, letters, words, watermark, signature, logo, blurry, scary, violence, blood"


def generate(prompt, w, h, seed, style=STYLE):
    body = {
        "prompt": f"{prompt}. {style}",
        "negative_prompt": NEGATIVE,
        "width": w, "height": h, "steps": 4, "cfg_scale": 1.0, "seed": seed,
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return base64.b64decode(json.load(r)["images"][0])


def to_jpg(png_path, jpg_path, width=1000):
    jpg_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72", "--resampleWidth", str(width),
                    str(png_path), "--out", str(jpg_path)], check=True, capture_output=True)


def lesson_file(lid):
    return LESSONS / f"{lid}.json"


def images_of(data):
    """Toutes les images d'une leçon (ou de companions.json, rangées par espèce)."""
    imgs = dict(data.get("images", {}))
    for sp in data.get("species", []):
        imgs.update(sp.get("images", {}))
    return imgs


def spec(lid, key):
    return images_of(json.loads(lesson_file(lid).read_text(encoding="utf-8")))[key]


def cmd_try(lid, key, seeds):
    s = spec(lid, key)
    out = WORK / "variants"
    out.mkdir(parents=True, exist_ok=True)
    for seed in seeds:
        png = out / f"{lid}-{key}-{seed}.png"
        png.write_bytes(generate(s["prompt"], s["w"], s["h"], seed))
        print(png)


def cmd_pick(lid, key, seed):
    f = lesson_file(lid)
    data = json.loads(f.read_text(encoding="utf-8"))
    s = images_of(data)[key]
    s["seed"] = seed
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    png = WORK / "variants" / f"{lid}-{key}-{seed}.png"
    if png.exists():
        to_jpg(png, IMG / lid / f"{key}.jpg", s.get("out_w", 1000))
    print(f"{key} : graine {seed} retenue")


def cmd_all():
    index = json.loads((LESSONS / "index.json").read_text(encoding="utf-8"))
    files = []
    for src in index["lessons"] + ["companions.json"]:
        data = json.loads((LESSONS / src).read_text(encoding="utf-8"))
        lid = data["id"]
        for key, s in images_of(data).items():
            if "seed" not in s:
                continue
            jpg = IMG / lid / f"{key}.jpg"
            if not jpg.exists():
                png = WORK / "variants" / f"{lid}-{key}-{s['seed']}.png"
                if not png.exists():
                    png.parent.mkdir(parents=True, exist_ok=True)
                    png.write_bytes(generate(s["prompt"], s["w"], s["h"], s["seed"]))
                to_jpg(png, jpg, s.get("out_w", 1000))
                print("image :", jpg.relative_to(ROOT))
            files.append(f"{lid}/{key}.jpg")
    IMG.mkdir(exist_ok=True)
    (IMG / "manifest.json").write_text(json.dumps({"images": sorted(files)}), encoding="utf-8")
    print(f"{len(files)} images")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "try":
        cmd_try(a[1], a[2], [int(x) for x in a[3:]] or [11, 22, 33])
    elif a and a[0] == "pick":
        cmd_pick(a[1], a[2], int(a[3]))
    else:
        cmd_all()
