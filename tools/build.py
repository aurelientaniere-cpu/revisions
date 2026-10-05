#!/usr/bin/env python3
"""Construit les leçons : génère les exercices automatiques et la liste des phrases à enregistrer.

Entrée  : lessons/index.json + lessons/<id>.json (écrits à la main)
Sortie  : lessons/build/<id>.json (lu par l'app)
Usage   : python3 tools/build.py
Bibliothèque standard uniquement.
"""
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import maths  # noqa: E402

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
            # Vrai / faux sur la définition : la vraie, puis celle d'un autre mot du groupe.
            # Redonne la définition : uniquement lors d'une séance suivante (`review`).
            if others:
                other = members[(members.index(n) + 1) % len(members)]
                for d, ok, diff in ((n["def"], True, 1), (other["def"], False, 2)):
                    items.append({
                        "type": "vf", "diff": diff, "review": True, "answer": ok, "notions": [n["id"]],
                        "q": f"« {cap(n['term'])} » veut dire : {d}.",
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

    # L'intrus : « Lequel n'est PAS {label} ? », si la leçon décrit le groupe dans `groups`.
    byid = {n["id"]: n for n in lesson["notions"]}
    for g, conf in lesson.get("groups", {}).items():
        members = groups.get(g, [])
        outsiders = [byid[x] for x in conf.get("outsiders", [])]
        if len(members) < 3 or not outsiders:
            continue
        for i, m in enumerate(members):
            o = outsiders[i % len(outsiders)]
            mates = [members[(i + k) % len(members)] for k in (0, 1, 2)]
            items.append({
                "type": "qcm", "diff": 3, "notions": [m["id"], o["id"]],
                "q": f"Lequel n'est PAS {conf['label']} ?",
                "choices": [cap(nom(o))] + [cap(nom(x)) for x in mates],
                "hint": conf.get("hint", ""),
                "explain": f"{cap(nom(o))} n'est pas {conf['label']}.",
            })
    return items


def fnv1a(text):
    """FNV-1a 32 bits (même calcul que clipKey() dans js/speech.js)."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def item_key(it):
    """Empreinte stable d'un exercice (type + question + réponses) : l'app s'en sert
    pour retenir, d'une séance à l'autre, quels exercices ont déjà été posés."""
    parts = [it["type"], it.get("layout", ""), it.get("q", ""), it.get("sentence", ""), str(it.get("target", ""))]
    parts += it.get("choices", []) + it.get("text", [])
    if it["type"] == "ecrire":
        parts += [it["word"], it.get("mode", "dictee")]
    if "answer" in it:
        parts.append(str(it["answer"]))
    parts += [f"{k['text']}>{k['target']}" for k in it.get("tokens", [])]
    return fnv1a("|".join(parts))


def trous_sentence(line):
    """Phrase de dictée à trous, avec la bonne réponse de chaque trou « [bon|faux] »."""
    return re.sub(r"\[([^\]]+)\]", lambda m: m.group(1).split("|")[0], line)


def item_speech(it):
    out = []
    t = it["type"]
    if t == "qcm":
        if it.get("sentence"):
            out.append(f"{PHRASES['completePrefix']} {it['sentence']}…")
            out.append(f"{it['sentence']} {it['choices'][0]}.")
        else:
            out.append(it["q"])
        # Orthographe : les fautes ne sont jamais lues (elles se liraient comme le bon mot).
        out += it["choices"][:1] if it.get("spell") else it["choices"]
    elif t == "trous":
        out.append(it.get("q", ""))
        out += [trous_sentence(x) for x in it["text"]]
    elif t == "ecrire":
        out += [it["word"], it.get("say", "")]
    elif t == "vf":
        out.append(f"{PHRASES['vfPrefix']} {it['q']}")
    elif t in maths.GEN_TYPES:
        out += maths.speech(it)
    elif t in ("schema", "placer"):
        out.append(it["q"])
    if t == "placer":
        out += [k["text"] for k in it["tokens"]]
        out += [g["label"] for g in it["targets"] if g.get("label")]
        if it.get("layout") == "phrase":
            order = {g["id"]: i for i, g in enumerate(it["targets"])}
            out.append(" ".join(k["text"] for k in sorted(it["tokens"], key=lambda k: order[k["target"]])))
        if it.get("layout") == "ordre":
            order = {g["id"]: i for i, g in enumerate(it["targets"])}
            out.append(", ".join(k["text"] for k in sorted(it["tokens"], key=lambda k: order[k["target"]])) + ".")
    if t not in maths.GEN_TYPES:
        out += [it.get("hint", ""), it.get("explain", "")]
    return out


def build(src):
    lesson = json.loads((LESSONS / src).read_text(encoding="utf-8"))
    ids = {n["id"] for n in lesson["notions"]}
    missing = [n["id"] for n in lesson["notions"] if n.get("group") and not n.get("noAuto") and not n.get("indice")]
    if missing:
        sys.exit(f"{src} : « indice » manquant pour {', '.join(missing)}")

    for g, conf in lesson.get("groups", {}).items():
        bad = [x for x in conf.get("outsiders", []) if x not in ids]
        if bad:
            sys.exit(f"{src} : groups.{g}.outsiders cite des notions inconnues {bad}")

    items = list(lesson.get("items", [])) + auto_items(lesson) + maths.items(lesson)
    for i, it in enumerate(items):
        if it["type"] == "trous":
            bad = [x for x in it["text"] if not re.search(r"\[[^\]]*\|", x)]
            if bad:
                sys.exit(f"{src} : item {i} (trous) : phrase sans trou {bad}")
        if it["type"] == "ecrire" and it.get("mode", "dictee") not in ("copie", "memo", "dictee"):
            sys.exit(f"{src} : item {i} (ecrire) : mode inconnu")
        if it.get("audio") and not (LESSONS / "music" / f"{it['audio']}.m4a").exists():
            sys.exit(f"{src} : item {i} : extrait lessons/music/{it['audio']}.m4a introuvable")
    seen_ids = set()
    for i, it in enumerate(items):
        bad = [x for x in it["notions"] if x not in ids]
        if bad:
            sys.exit(f"{src} : item {i} cite des notions inconnues {bad}")
        # Id écrit à la main conservé ; sinon empreinte du contenu (ne bouge pas quand on ajoute des exercices).
        base = it.get("id") or f"{lesson['id']}#{item_key(it)}"
        uid, k = base, 2
        while uid in seen_ids:
            uid, k = f"{base}-{k}", k + 1
        seen_ids.add(uid)
        it["id"] = uid
    lesson["items"] = items

    speech = []
    speech += lesson.get("summary", [])
    for n in lesson["notions"]:
        speech.append(f"{cap(nom(n))} : {n['def']}.")
        speech.append(cap(n["term"]))
        if n.get("tip"):
            speech.append(n["tip"])
        if n.get("example"):
            speech.append(n["example"]["say"])
        if n.get("zone"):
            speech.append(PHRASES["zoneThis"].replace("{x}", nom(n)))
            speech.append(PHRASES["zoneHere"].replace("{x}", nom(n)))
    if lesson.get("maths"):
        speech += maths.NUMBERS
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
