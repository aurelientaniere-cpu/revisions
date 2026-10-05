"""Exercices de calcul générés pour les leçons de maths (champ « maths » d'une leçon, voir lessons/FORMAT.md).

Appelé par tools/build.py. Chaque recette produit des exercices dont tout le texte lu est fixé ici
(il est enregistré par tools/voice.py) : « Combien font 8 plus 5 ? », « 8 plus 5 égale 13. »…
Bibliothèque standard uniquement.
"""
import random

N = range(1, 10)  # table d'addition de 1 à 9


def fact(a, b):
    return f"{a} plus {b} égale {a + b}."


def strategy(a, b):
    """Astuce pour a + b, sans donner le résultat (indice après une erreur)."""
    lo, hi = sorted((a, b))
    if lo == 0:
        return "Ajouter 0, ça ne change rien."
    if lo == 1:
        return "Ajouter 1, c'est dire le nombre juste après."
    if lo == 2:
        return "Ajouter 2, c'est avancer de deux bonds."
    if lo == hi:
        return "C'est un double : deux fois le même nombre."
    if hi - lo == 1:
        return "C'est presque un double. Pense au double du plus petit, puis ajoute 1."
    if hi == 9:
        return "Pour ajouter 9, ajoute 10, puis enlève 1."
    if a + b == 10:
        return "Ce sont des amis de 10. Regarde le boulier : la ligne est pleine."
    if a + b > 10:
        return "Complète d'abord jusqu'à 10, puis ajoute ce qui reste."
    return "Pars du plus grand nombre, puis avance."


def choices(ans):
    """La bonne réponse d'abord, puis des erreurs plausibles (un de plus, un de moins…)."""
    cands = [ans + 1, ans - 1] + ([ans - 10] if ans > 10 else []) + [ans + 2, ans - 2, ans + 3]
    out = [ans]
    for c in cands:
        if 0 <= c <= 20 and c not in out:
            out.append(c)
    return [str(x) for x in out[:4]]


def calcul(lid, nid, key, diff, expr, answer, say, explain, hint, beads=None, tree=None):
    it = {
        "id": f"{lid}#{nid}/{key}", "type": "calcul", "diff": diff, "notions": [nid],
        "expr": expr, "answer": str(answer), "choices": choices(answer),
        "say": say, "explain": explain, "hint": hint,
    }
    if beads:
        it["beads"] = beads
    if tree:
        it["tree"] = tree
    return it


def gen_somme(lid, nid, spec):
    out = []
    for a, b in spec["pairs"]:
        out.append(calcul(lid, nid, f"{a}+{b}", spec.get("diff", 2),
                          [f"{a}|a", "+", f"{b}|b", "=", "?"], a + b,
                          f"Combien font {a} plus {b} ?", fact(a, b),
                          spec.get("hint") or strategy(a, b), beads=[a, b]))
    return out


def gen_ligne_faits(lid, nid, spec):
    """Les calculs d'une ligne de la table (n + k), dans un sens ou dans l'autre."""
    n = spec["row"]
    pairs = [(n, k) if k % 2 else (k, n) for k in N if k != n]
    return gen_somme(lid, nid, {**spec, "pairs": pairs})


def gen_manque(lid, nid, spec):
    """a + ? = total (compléments)."""
    out = []
    for a, total in spec["pairs"]:
        b = total - a
        out.append(calcul(lid, nid, f"{a}+?={total}", spec.get("diff", 3),
                          [f"{a}|a", "+", "?", "=", str(total)], b,
                          f"{a} plus combien égale {total} ?", fact(a, b),
                          spec.get("hint") or strategy(a, b), beads=[a]))
    return out


def gen_dizaine(lid, nid, spec):
    """« 17 = 10 + ? » : un nombre de 11 à 19, c'est 10 et encore quelques unités."""
    out = []
    for n in spec["numbers"]:
        out.append(calcul(lid, nid, f"{n}=10+?", spec.get("diff", 3),
                          [str(n), "=", "10|a", "+", "?"], n - 10,
                          f"{n}, c'est 10 plus combien ?", f"{n}, c'est 10 plus {n - 10}.",
                          spec.get("hint", ""), beads=[10, n - 10]))
    return out


def gen_arbre(lid, nid, spec):
    """Arbre de la fiche : 10 en haut, trois nombres en bas, l'un manque."""
    out = []
    for terms in spec["trees"]:
        i = terms.index(None)
        ans = 10 - sum(t for t in terms if t is not None)
        full = [ans if t is None else t for t in terms]
        # Couleurs dans l'ordre des nombres donnés, comme leurs boules sur le boulier.
        colors = iter("abc")
        labels = ["?" if t is None else f"{t}|{next(colors)}" for t in terms]
        out.append(calcul(lid, nid, "arbre-" + "+".join(str(t) for t in full) + f"-{i}", spec.get("diff", 2.5),
                          labels[:1] + sum((["+", x] for x in labels[1:]), []) + ["=", "10"], ans,
                          "Quel nombre manque pour faire 10 ?",
                          " plus ".join(str(t) for t in full) + " égale 10.",
                          spec.get("hint", ""), beads=[t for t in terms if t is not None], tree={"top": "10"}))
    return out


def gen_echange(lid, nid, spec):
    out = []
    for a, b in spec["pairs"]:
        out.append(calcul(lid, nid, f"{a}+{b}={b}+?", spec.get("diff", 2.5),
                          [f"{a}|a", "+", f"{b}|b", "=", f"{b}|b", "+", "?"], a,
                          f"{a} plus {b}, c'est {b} plus combien ?",
                          f"{a} plus {b}, c'est pareil que {b} plus {a}. Les deux font {a + b}.",
                          spec.get("hint", ""), beads=[a, b]))
    return out


def gen_decomp(lid, nid, spec):
    """Passer par 10 : 8 + 5 = 8 + 2 + ? (puis, une fois sur deux, 8 + 5 = 8 + ? + 3)."""
    out = []
    for k, (a, b) in enumerate(spec["pairs"]):
        c = 10 - a
        r = b - c
        explain = f"{a} plus {c} égale 10. 10 plus {r} égale {a + b}."
        if k % 2 == 0:
            expr, ans, say = [f"{a}|a", "+", f"{b}|b", "=", f"{a}|a", "+", f"{c}|b", "+", "?"], r, \
                f"{a} plus {b}, c'est {a} plus {c} plus combien ?"
        else:
            expr, ans, say = [f"{a}|a", "+", f"{b}|b", "=", f"{a}|a", "+", "?", "+", f"{r}|b"], c, \
                f"{a} plus {b}, c'est {a} plus combien plus {r} ?"
        out.append(calcul(lid, nid, f"{a}+{b}-decomp{k % 2}", spec.get("diff", 3), expr, ans, say, explain,
                          spec.get("hint") or "Combien faut-il ajouter pour arriver à 10 ? Regarde le boulier.",
                          beads=[a, b]))
    return out


def gen_boulier(lid, nid, spec):
    out = []
    for n in spec.get("show", []):
        out.append({
            "id": f"{lid}#{nid}/boulier-{n}", "type": "boulier", "diff": spec.get("diff", 2), "notions": [nid],
            "target": n, "q": f"Montre {n} sur le boulier.",
            "explain": f"{n}, c'est 10 plus {n - 10}." if n > 10 else "",
        })
    for a, b in spec.get("sums", []):
        out.append({
            "id": f"{lid}#{nid}/boulier-{a}+{b}", "type": "boulier", "diff": spec.get("diff", 2), "notions": [nid],
            "target": a + b, "parts": [a, b], "q": f"Fais {a} plus {b} sur le boulier.",
            "explain": fact(a, b),
        })
    return out


def gen_dix(lid, nid, spec):
    """Fiche « Entoure les deux nombres dont la somme est égale à 10 puis calcule »."""
    out = []
    for terms in spec["terms"]:
        pairs = [(i, j) for i in range(len(terms)) for j in range(i + 1, len(terms)) if terms[i] + terms[j] == 10]
        if not pairs:  # s'il y en a plusieurs, l'app les accepte toutes (le reste est le même)
            raise SystemExit(f"{lid} : {terms} doit contenir deux nombres qui font 10")
        i, j = pairs[0]
        others = [t for k, t in enumerate(terms) if k not in (i, j)]
        rest = sum(others)
        out.append({
            "id": f"{lid}#{nid}/dix-" + "+".join(map(str, terms)), "type": "amis10", "diff": spec.get("diff", 2.5),
            "notions": [nid], "terms": terms, "rest": str(rest), "total": str(10 + rest),
            "restChoices": choices(rest), "totalChoices": choices(10 + rest),
            "q": "Touche les deux nombres qui font 10.",
            "restSay": " plus ".join(map(str, others)) + " égale " + str(rest) + "." if len(others) > 1 else "",
            "say": f"Combien font 10 plus {rest} ?",
            "explain": f"{terms[i]} plus {terms[j]} égale 10. 10 plus {rest} égale {10 + rest}.",
        })
    return out


def holes(a, b):
    return {"a": a, "b": b, "answer": str(a + b), "choices": choices(a + b), "say": fact(a, b), "hint": strategy(a, b)}


def gen_ligne(lid, nid, spec):
    """Une ligne de la table (n + 1 … n + 9) avec des cases vides."""
    n = spec["row"]
    out = []
    for v in range(spec.get("variants", 3)):
        rnd = random.Random(f"{lid}/{nid}/{v}")
        ks = sorted(rnd.sample([k for k in N], spec.get("holes", 4)))
        out.append({
            "id": f"{lid}#{nid}/ligne-{n}-{v}", "type": "table", "layout": "ligne", "diff": spec.get("diff", 2.5),
            "notions": [nid], "row": n, "q": f"Complète la ligne du {n}.",
            "holes": [holes(n, k) for k in ks],
        })
    return out


def gen_grille(lid, nid, spec):
    """La table entière (1 à 9) avec des cases vides, une par ligne au plus."""
    out = []
    for v in range(spec.get("variants", 6)):
        rnd = random.Random(f"{lid}/{nid}/grille/{v}")
        rows = sorted(rnd.sample(list(N), spec.get("holes", 7)))
        cells = [(a, rnd.choice(list(N))) for a in rows]
        out.append({
            "id": f"{lid}#{nid}/grille-{v}", "type": "table", "layout": "grille", "diff": spec.get("diff", 3),
            "notions": [nid], "q": "Complète la table d'addition.",
            "holes": [holes(a, b) for a, b in cells],
        })
    return out


GENS = {
    "somme": gen_somme, "ligne-faits": gen_ligne_faits, "manque": gen_manque, "dizaine": gen_dizaine,
    "arbre": gen_arbre, "echange": gen_echange, "decomp": gen_decomp, "boulier": gen_boulier,
    "dix": gen_dix, "ligne": gen_ligne, "grille": gen_grille,
}


def items(lesson):
    out = []
    for spec in lesson.get("maths", []):
        if spec["gen"] not in GENS:
            raise SystemExit(f"{lesson['id']} : recette de maths inconnue « {spec['gen']} »")
        out += GENS[spec["gen"]](lesson["id"], spec["notion"], spec)
    return out


def speech(it):
    """Phrases à enregistrer pour un exercice de maths."""
    t = it["type"]
    if t == "calcul":
        return [it["say"], it["explain"], it.get("hint", "")]
    if t == "boulier":
        return [it["q"], it.get("explain", "")]
    if t == "amis10":
        return [it["q"], it["restSay"], it["say"], it["explain"]]
    if t == "table":
        return [it["q"]] + [x for hl in it["holes"] for x in (hl["say"], hl["hint"])]
    return []


NUMBERS = [str(i) for i in range(21)]  # le 🔊 de chaque réponse
GEN_TYPES = ("calcul", "boulier", "amis10", "table")
