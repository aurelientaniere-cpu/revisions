#!/usr/bin/env python3
"""Construit les leçons : génère les exercices automatiques et la liste des phrases à enregistrer.

Entrée  : lessons/index.json + lessons/<id>.json (écrits à la main)
Sortie  : lessons/build/<id>.json (lu par l'app)
Usage   : python3 tools/build.py
Bibliothèque standard uniquement.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
OUT = LESSONS / "build"
PHRASES = json.loads((ROOT / "phrases.json").read_text(encoding="utf-8"))


def cap(s):
    return s[:1].upper() + s[1:]


def nom(n):
    return n.get("nom") or n["term"]


def auto_items(lesson):
    items = []
    groups = {}
    for n in lesson["notions"]:
        if n.get("group") and not n.get("noAuto"):
            groups.setdefault(n["group"], []).append(n)

    for members in groups.values():
        for n in members:
            others = [o for o in members if o is not n]
            explain = f"{cap(nom(n))} : {n['def']}."
            # Situation concrète -> retrouver le mot (ne recopie pas la définition).
            if n.get("indice"):
                items.append({
                    "type": "qcm", "diff": 2, "notions": [n["id"]],
                    "q": f"De quoi parle-t-on ? {n['indice']}",
                    "choices": [cap(n["term"])] + [cap(o["term"]) for o in others],
                    "explain": explain,
                })
            # Définition -> uniquement pour une notion vue lors d'une séance précédente.
            items.append({
                "type": "qcm", "diff": 2, "review": True, "notions": [n["id"]],
                "q": f"Que veut dire « {n['term']} » ?",
                "choices": [cap(n["def"])] + [cap(o["def"]) for o in others],
                "explain": explain,
            })
            if n.get("zone") and lesson.get("schema"):
                items.append({
                    "type": "schema", "diff": 2, "notions": [n["id"]], "target": n["zone"],
                    "q": f"Touche {nom(n)} sur le château.",
                    "explain": explain,
                })
        for i in range(0, len(members) - 2, 3):
            trio = members[i:i + 3]
            if len(trio) < 3:
                break
            items.append({
                "type": "placer", "layout": "relie", "diff": 2, "review": True,
                "notions": [n["id"] for n in trio],
                "q": "Relie chaque mot à sa définition.",
                "targets": [{"id": n["id"], "label": cap(n["def"])} for n in trio],
                "tokens": [{"text": cap(n["term"]), "target": n["id"]} for n in trio],
            })
    return items


def item_speech(it):
    out = []
    t = it["type"]
    if t == "qcm":
        if it.get("sentence"):
            out.append(f"{PHRASES['completePrefix']} {it['sentence']}…")
            out.append(f"{it['sentence']} {it['choices'][0]}.")
        else:
            out.append(it["q"])
        out += it["choices"]
    elif t == "vf":
        out.append(f"{PHRASES['vfPrefix']} {it['q']}")
    elif t in ("schema", "placer"):
        out.append(it["q"])
    if t == "placer":
        out += [k["text"] for k in it["tokens"]]
        out += [g["label"] for g in it["targets"] if g.get("label")]
        if it.get("layout") == "phrase":
            order = {g["id"]: i for i, g in enumerate(it["targets"])}
            out.append(" ".join(k["text"] for k in sorted(it["tokens"], key=lambda k: order[k["target"]])))
    out += [it.get("hint", ""), it.get("explain", "")]
    return out


def build(src):
    lesson = json.loads((LESSONS / src).read_text(encoding="utf-8"))
    ids = {n["id"] for n in lesson["notions"]}
    missing = [n["id"] for n in lesson["notions"] if n.get("group") and not n.get("noAuto") and not n.get("indice")]
    if missing:
        sys.exit(f"{src} : « indice » manquant pour {', '.join(missing)}")

    items = list(lesson.get("items", [])) + auto_items(lesson)
    for i, it in enumerate(items):
        bad = [x for x in it["notions"] if x not in ids]
        if bad:
            sys.exit(f"{src} : item {i} cite des notions inconnues {bad}")
        it["id"] = f"{lesson['id']}#{i}"
    lesson["items"] = items

    speech = []
    speech += lesson.get("summary", [])
    for n in lesson["notions"]:
        speech.append(f"{cap(nom(n))} : {n['def']}.")
        speech.append(cap(n["term"]))
        if n.get("zone"):
            speech.append(PHRASES["zoneThis"].replace("{x}", nom(n)))
            speech.append(PHRASES["zoneHere"].replace("{x}", nom(n)))
    for c in lesson.get("cards", []):
        speech += [c["name"], c["desc"]]
    for it in items:
        speech += item_speech(it)
    lesson["speech"] = sorted({s.strip() for s in speech if s and s.strip()})

    OUT.mkdir(exist_ok=True)
    (OUT / src).write_text(json.dumps(lesson, ensure_ascii=False, indent=1), encoding="utf-8")
    kinds = {}
    for it in items:
        k = it.get("layout") or it["type"]
        kinds[k] = kinds.get(k, 0) + 1
    print(f"{src} : {len(items)} exercices {kinds}, {len(lesson['speech'])} phrases")


def main():
    index = json.loads((LESSONS / "index.json").read_text(encoding="utf-8"))
    for src in index["lessons"]:
        build(src)


if __name__ == "__main__":
    main()
