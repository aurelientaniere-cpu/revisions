#!/usr/bin/env python3
"""Enregistre toutes les phrases de l'app avec la voix Piper (100 % local, sans réseau).

Usage :
  ~/.revisions-cm1/venv/bin/python tools/voice.py            # enregistre les phrases manquantes ou à refaire
  ~/.revisions-cm1/venv/bin/python tools/voice.py --audit    # repère les prononciations douteuses
  ~/.revisions-cm1/venv/bin/python tools/voice.py --samples  # extraits pour choisir la voix

Outillage hors du dossier Google Drive (espeak refuse les chemins trop longs) :
  ~/.revisions-cm1/venv    Python + Piper (installé depuis tools/requirements.txt, empreintes figées)
  ~/.revisions-cm1/voices  voix .onnx (empreintes dans tools/voices.sha256)

Entrées : phrases.json, lessons/companions.json (noms et stades), lessons/build/*.json (voir tools/build.py), tools/voice.json,
          tools/prononciation.json (lexique : mot -> graphie, ou [[phonèmes]], donnée à la voix)
Sortie  : audio/<empreinte>.m4a + audio/manifest.json (lu par l'app)
          + audio/spoken.json (texte réellement prononcé par clip : un clip est refait si ce texte change)
"""
import collections
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig
from piper.phonemize_espeak import ESPEAK_DATA_DIR

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
AUDIO = ROOT / "audio"
HOME = pathlib.Path.home() / ".revisions-cm1"
CONF = json.loads((TOOLS / "voice.json").read_text(encoding="utf-8"))
SPOKEN = AUDIO / "spoken.json"


def clip_key(text):
    """FNV-1a 32 bits, identique à clipKey() dans js/speech.js."""
    h = 0x811C9DC5
    for b in text.strip().encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


ORD = ["", "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième", "huitième",
       "neuvième", "dixième", "onzième", "douzième", "treizième", "quatorzième", "quinzième", "seizième",
       "dix-septième", "dix-huitième", "dix-neuvième", "vingtième", "vingt et unième"]


def roman(s):
    val = {"I": 1, "V": 5, "X": 10}
    n = 0
    for i, c in enumerate(s):
        a, b = val[c], val.get(s[i + 1], 0) if i + 1 < len(s) else 0
        n += -a if a < b else a
    return n


def base_speech(text):
    """Même règle que toSpeech() dans js/speech.js (sans le lexique, propre à l'enregistrement)."""
    def ordinal(m):
        n = roman(m.group(1))
        return ORD[n] if 0 < n < len(ORD) else m.group(0)
    t = re.sub(r"\b([IVX]+)(e|er|ème)\b", ordinal, text)
    t = re.sub(r"\s*[–—]\s*(?=[a-zé])", " au ", t)
    t = re.sub(r"\b[Aa]ux (\S+ième au \S+ième)", r"du \1", t)
    t = re.sub(r"(ième au \S+ième) siècles", r"\1 siècle", t)
    t = re.sub(r"(ième au \S+ième) s\.", r"\1 siècle", t)
    t = re.sub(r"…|\.\.\.", ", ", t)
    t = re.sub(r"[«»]", "", t)
    return t.strip()


# Emoji : équivalent de \p{Extended_Pictographic} dans js/speech.js (+ sélecteur de variante et liant).
EMOJI = re.compile("[\u00a9\u00ae\u203c\u2049\u2122\u2139\u2194-\u21aa\u231a-\u23ff\u24c2\u25aa-\u25fe"
                   "\u2600-\u27bf\u2934\u2935\u2b05-\u2b55\u3030\u303d\u3297\u3299"
                   "\U0001f000-\U0001faff\ufe0f\u200d]")

# Lexique (tools/prononciation.json) :
#  - "mots" : mot entier (ou expression) -> graphie de remplacement, ou [[phonèmes]] bruts (passés tels quels
#    par Piper). Clé en minuscules : toute casse, majuscule initiale conservée. Clé avec une majuscule
#    (nom propre, sigle) : cette casse exacte seulement.
#  - "sans_liaison_apres" : mots après lesquels espeak ne doit pas faire de liaison (noms, adjectifs au pluriel :
#    « les remparts | où »), "sans_liaison_avant" : mots qui n'en reçoivent jamais (« et », « ou »),
#    "liaison_gardee" : exceptions (« vingt et un »). Une apostrophe isolée « ' » bloque la liaison sans pause.
PRON = json.loads((TOOLS / "prononciation.json").read_text(encoding="utf-8"))
LEXICON = {k: v for k, v in PRON.get("mots", {}).items() if not k.startswith("_")}
LEX_LOWER = {k: k for k in LEXICON if k == k.lower()}
B, E = r"(?<![\w\['’-])", r"(?![\w\]'’-])"   # bornes de mot (ni apostrophe, ni trait d'union, ni [[ ]])
LEX_RE = re.compile(B + "(" + "|".join(re.escape(k) for k in sorted(LEXICON, key=len, reverse=True))
                    + ")" + E, re.IGNORECASE) if LEXICON else None
LIAISON_CONS = "sxtdzn"
VOWEL = "[aeiouyhàâéèêëîïôöûùüœæAEIOUYHÀÂÉÈÊËÎÏÔÖÛÙÜŒÆ]"
NO_AFTER = {w.lower() for w in PRON.get("sans_liaison_apres", [])}
NO_BEFORE = {w.lower() for w in PRON.get("sans_liaison_avant", [])}
KEEP = [e.lower() for e in PRON.get("liaison_gardee", [])]


def block_liaisons(t):
    """Insère « ' » entre deux mots du même groupe quand la liaison qu'espeak ferait est fautive."""
    def repl(m):
        prev, nxt = m.group(1), m.group(2)
        pl, nl = re.split(r"['’]", prev.lower())[-1], re.split(r"['’]", nxt.lower())[0]
        if pl[-1:] not in LIAISON_CONS or any(k.startswith(f"{pl} {nl}") for k in KEEP):
            return m.group(0)
        return f"{prev} ' " if pl in NO_AFTER or nl in NO_BEFORE else m.group(0)
    return re.sub(B + r"([\w'’-]+) +(?=(" + VOWEL + r"[\w’'-]*))", repl, t)


def apply_lexicon(t):
    def repl(m):
        w = m.group(0)
        if w in LEXICON:
            return LEXICON[w]
        k = LEX_LOWER.get(w.lower())
        if k is None:  # clé sensible à la casse, écrite autrement ici : on n'y touche pas
            return w
        v = LEXICON[k]
        if w[:1].isupper() and not v.startswith("[["):
            v = v[:1].upper() + v[1:]
        return v
    return LEX_RE.sub(repl, t) if LEX_RE else t


ENGINE = CONF.get("engine", "piper")
APPLE = CONF.get("apple", {})
# Signature de la voix, gardée devant le texte dans spoken.json : changer de voix fait tout réenregistrer.
# Piper garde l'ancien format (texte seul).
SIG = f"apple:{APPLE.get('voice')}:{APPLE.get('rate')}|" if ENGINE == "apple" else ""
APPLE_LEX = {k: v for k, v in PRON.get("mots_apple", {}).items() if not k.startswith("_")}

# Mots anglais (champ « english » des leçons) : lus par la voix anglaise de tools/voice.json (« english »).
# Dans le texte prononcé, chaque suite de mots anglais est entourée de ⟦ ⟧, et la signature de la voix anglaise
# est mise devant : changer de voix anglaise ne refait que les clips qui contiennent de l'anglais.
EN = CONF.get("english", {})
EN_SIG = f"en:{EN.get('voice')}:{EN.get('rate')}|"
EN_WORDS = sorted({w for f in (ROOT / "lessons" / "build").glob("*.json")
                   for w in json.loads(f.read_text(encoding="utf-8")).get("english", [])}, key=len, reverse=True)
EN_WORD = r"(?<![\w'’-])(?:" + "|".join(re.escape(w) for w in EN_WORDS) + r")(?![\w'’-])"
EN_RUN = re.compile(EN_WORD + r"(?:[\s,.;:!?-]+" + EN_WORD + ")*") if EN_WORDS else None


def to_speech(text):
    """Texte réellement donné à la voix : règles de js/speech.js, sans emoji, puis
    Piper : liaisons fautives bloquées + lexique ; Apple : lexique « mots_apple » seulement (espeak n'intervient pas)."""
    t = re.sub(r"\s{2,}", " ", EMOJI.sub("", base_speech(text))).strip()
    if ENGINE == "apple":
        for k, v in APPLE_LEX.items():
            t = re.sub(B + re.escape(k) + E, v, t)
        if EN_RUN and EN_RUN.search(t):
            t = EN_SIG + EN_RUN.sub(lambda m: f"⟦{m.group(0)}⟧", t)
        return t
    return apply_lexicon(block_liaisons(t))


def synth_apple(spoken, out_m4a):
    """Voix système du Mac (commande say), puis même format que Piper : AAC 64 kb/s mono."""
    if spoken.startswith(EN_SIG):
        return synth_mixed(spoken[len(EN_SIG):], out_m4a)
    with tempfile.TemporaryDirectory() as d:
        txt, aiff = pathlib.Path(d) / "t.txt", pathlib.Path(d) / "t.aiff"
        txt.write_text(spoken, encoding="utf-8")
        subprocess.run(["say", "-v", APPLE["voice"], "-r", str(APPLE["rate"]), "-f", str(txt), "-o", str(aiff)],
                       check=True, capture_output=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", "-c", "1", str(aiff), str(out_m4a)],
                       check=True, capture_output=True)


def synth_mixed(spoken, out_m4a):
    """Phrase avec de l'anglais : chaque morceau est dit par sa voix, puis les morceaux sont mis bout à bout."""
    rate, pause = 22050, 0.12
    frames = []
    with tempfile.TemporaryDirectory() as d:
        for i, part in enumerate(re.split(r"(⟦[^⟧]*⟧)", spoken)):
            english = part.startswith("⟦")
            text = part.strip("⟦⟧ ")
            if not re.search(r"\w", text):
                continue
            voice = EN if english else APPLE
            txt, wav = pathlib.Path(d) / f"{i}.txt", pathlib.Path(d) / f"{i}.wav"
            txt.write_text(text, encoding="utf-8")
            subprocess.run(["say", "-v", voice["voice"], "-r", str(voice["rate"]), "-f", str(txt), "-o", str(wav),
                            "--file-format=WAVE", f"--data-format=LEI16@{rate}"], check=True, capture_output=True)
            with wave.open(str(wav), "rb") as w:
                frames.append(w.readframes(w.getnframes()))
        out = pathlib.Path(d) / "all.wav"
        with wave.open(str(out), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes((b"\0\0" * int(rate * pause)).join(frames))
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", "-c", "1", str(out), str(out_m4a)],
                       check=True, capture_output=True)


def all_segments():
    phrases = json.loads((ROOT / "phrases.json").read_text(encoding="utf-8"))
    segs = set()

    def walk(v):
        if isinstance(v, str):
            if "{x}" not in v:
                segs.add(v.strip())
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
    walk(phrases)
    companions = json.loads((ROOT / "lessons" / "companions.json").read_text(encoding="utf-8"))
    for sp in companions["species"]:
        walk([sp["name"], sp["stages"]])
    for f in sorted((ROOT / "lessons" / "build").glob("*.json")):
        segs.update(json.loads(f.read_text(encoding="utf-8"))["speech"])
    return sorted(s for s in segs if s)


def synth(voice, spoken, out_m4a, speaker=None):
    """Enregistre le texte déjà passé par to_speech()."""
    cfg = SynthesisConfig(
        speaker_id=speaker if speaker is not None else CONF.get("speaker_id"),
        length_scale=CONF.get("length_scale"),
        noise_scale=CONF.get("noise_scale"),
        noise_w_scale=CONF.get("noise_w_scale"),
    )
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            voice.synthesize_wav(spoken, w, syn_config=cfg)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", "-c", "1", tmp.name, str(out_m4a)],
                       check=True, capture_output=True)


def espeak_dir():
    # Copie des données de prononciation vers un chemin court.
    short = HOME / "espeak-ng-data"
    if not short.exists():
        import shutil
        shutil.copytree(ESPEAK_DATA_DIR, short)
    return short


def load(name):
    return PiperVoice.load(str(HOME / "voices" / f"{name}.onnx"), espeak_data_dir=espeak_dir())


def samples():
    out = HOME / "samples"
    out.mkdir(parents=True, exist_ok=True)
    text = ("De quoi parle-t-on ? Quand l'ennemi approche, les gardes le remontent avec des chaînes. "
            "Bravo ! Le pont-levis empêche d'entrer dans le château fort, aux XIe–XIIIe siècles.")
    for name, speaker in CONF["candidates"]:
        voice = load(name)
        label = f"{name}{'-' + str(speaker) if speaker is not None else ''}"
        synth(voice, to_speech(text), out / f"{label}.m4a", speaker)
        print("extrait :", out / f"{label}.m4a")


# ---------- Audit de prononciation (--audit) ----------

def phonemes(text):
    """Phonèmes espeak d'un texte, tels que Piper les verra (les [[phonèmes]] bruts passent tels quels).
    Les mots pris pour de l'anglais (ou autre) sont marqués « (en) » : Piper retire la marque, pas l'accent."""
    from piper import espeakbridge
    out = []
    for part in re.split(r"(\[\[.*?\]\])", text):
        if part.startswith("[["):
            out.append(part[2:-2].strip())
        elif part.strip():
            out.append(" ".join(p + t for p, t, _ in espeakbridge.get_phonemes(part)))
    return " ".join(out)


WORD = re.compile(r"[\w’'-]+")
NASAL_A = "ɑ̃"
# Mots après lesquels un « -ent » est presque toujours la fin d'un verbe au pluriel.
BEFORE_VERB = {"ils", "elles", "qui", "se", "s'", "s’", "ne", "n'", "n’", "leur", "lui", "y", "en", "me", "te"}
PLURAL_DET = {"les", "des", "ces", "mes", "tes", "ses", "nos", "vos", "leurs", "plusieurs", "certains",
              "certaines", "quelques", "deux", "trois", "quatre", "beaucoup"}
SINGULAR_DET = {"le", "un", "du", "au", "ce", "cet", "mon", "ton", "son", "l'", "l’", "d'", "d’", "chaque"}
H_ASPIRE = ("haricot", "héros", "hibou", "herse", "hache", "haie", "hameau", "hanche", "hangar", "hareng",
            "haut", "hauteur", "honte", "hutte", "huit", "hurler", "hêtre", "hérisson", "homard", "hongrois")
# Mots après lesquels la liaison est normale (déterminants, pronoms, prépositions, adjectifs placés avant le nom).
LIAISON_OK = PLURAL_DET | BEFORE_VERB | SINGULAR_DET | {
    "on", "nous", "vous", "un", "très", "plus", "moins", "dans", "sans", "chez", "quand", "dont", "tout", "tous",
    "toutes", "petits", "petites", "grands", "grandes", "gros", "grosse", "bons", "bonnes", "beaux", "vieux",
    "nouveaux", "anciens", "autres", "mêmes", "premiers", "derniers", "est", "sont", "ont", "font", "vont",
    "aux", "mon", "ton", "son", "aucun", "bien", "rien", "c'est", "n'est", "cet", "mais", "pas", "peut", "doit",
    "vingt", "cent", "six", "dix", "moyen", "chacun", "grand"}


def tokens(t):
    """Mots avec l'élision détachée (« l'est » -> « l' », « est »)."""
    out = []
    for w in WORD.findall(t):
        m = re.match(r"^([a-zA-Z]{1,2}['’])(.+)$", w)
        out += [m.group(1), m.group(2)] if m else [w]
    return out


def audit():
    from piper import espeakbridge
    v = load(CONF["voice"])
    v.phonemize("a")  # initialise espeak avec les données de la voix
    espeakbridge.set_voice(v.config.espeak_voice)
    segs = all_segments()
    found = collections.defaultdict(dict)   # catégorie -> {clé : ligne}
    nasal_words = collections.Counter()

    def flag(cat, key, line):
        found[cat].setdefault(key, line)

    for s in segs:
        say = to_speech(s)
        ph = phonemes(say)
        plain = re.sub(r"\[\[.*?\]\]", "", say)
        toks = tokens(plain)
        low = [w.lower() for w in toks]
        for i, w in enumerate(toks):
            lw, prev = low[i], low[i - 1] if i else ""
            prev2 = low[i - 2] if i > 1 else ""
            # 1. « -ent » : lu « an » (ɑ̃) ou muet ? On compare avec la phrase où « lèvent » devient « lève ».
            if len(lw) > 4 and lw.endswith("ent"):
                variant = re.sub(r"(?<![\w-])" + re.escape(w) + r"(?![\w-])", w[:-2], plain, count=1)
                reads_an = phonemes(plain).count(NASAL_A) > phonemes(variant).count(NASAL_A)
                verb_ctx = prev in BEFORE_VERB or (prev.endswith(("s", "x")) and prev2 in PLURAL_DET)
                if reads_an:
                    nasal_words[lw] += 1
                    if verb_ctx:
                        flag("ent lu « an » après un sujet pluriel (verbe ?)", lw, f"{w!r} dans : {s}")
                elif prev in SINGULAR_DET:
                    flag("ent muet après un déterminant (nom ?)", lw, f"{w!r} dans : {s}")
            # 2. Nombres, sigles, noms propres : à vérifier une fois à l'oreille.
            if re.search(r"\d", w):
                flag("nombres", w, f"{w} -> {phonemes(w)}   ({s})")
            elif len(w) > 1 and w.isupper() and w.isalpha() and not re.fullmatch(r"[IVX]+", w):
                flag("sigles", w, f"{w} -> {phonemes(w)}   ({s})")
            elif (w[:1].isupper() and i > 0 and lw not in SINGULAR_DET | {"la", "les"}
                  and not re.search(r"[.!?:]\s*$", plain[:plain.find(w)])):
                flag("noms propres", w, f"{w} -> {phonemes(w)}")
        # 3. Liaisons faites par espeak dans la phrase : jamais devant « et », « ou » ni un h aspiré ;
        #    après un nom ou un adjectif pluriel, souvent fautive (« les remparts-z-où »).
        flat = ph.replace("ˈ", "").replace("ˌ", "")
        for m in re.finditer(r"(?<![\w'’-])([\w-]+) +(?=(" + VOWEL + r"[\w-]*))", plain):
            w, nxt = m.group(1), m.group(2)
            lw = w.lower()
            # Verbe au pluriel + « t » (« ils vivent-t-en ville ») : liaison facultative, acceptée.
            if lw[-1:] not in LIAISON_CONS or lw in LIAISON_OK or lw.endswith(("ent", "ont")):
                continue
            alone = phonemes(w).rstrip(" .-")
            both = phonemes(f"{w} {nxt}")
            rest = both[len(alone):] if both.startswith(alone) else ""
            if not re.match(r"-?[zntp] ", rest) or both.replace("ˈ", "").replace("ˌ", "") not in flat:
                continue
            line = f"{w} {nxt} -> {both}   ({s})"
            if nxt.lower() in ("et", "ou") or nxt.lower().startswith(H_ASPIRE):
                flag("liaison interdite (devant et / ou / h aspiré)", f"{lw} {nxt.lower()}", line)
            else:
                flag("liaison après un nom, un adjectif ou un verbe (à vérifier)", f"{lw} {nxt.lower()}", line)
        # 4. Mots en « -se » : voyelle + se = /z/ ; « -ose » lu ɔ ouvert (chose, rose), « -ause » /o/ bref.
        for m in re.finditer(r"\b\w*[aeiouéèêôâûy]s(?:es?|ent)\b", plain, re.IGNORECASE):
            w = m.group(0)
            p = phonemes(w)
            if p.rstrip(".,!? ").endswith("s"):
                flag("-se lu /s/", w.lower(), f"{w} -> {p}")
            elif re.search(r"ˈ?[oɔ]z", p) and "oːz" not in p:
                flag("-ose / -ause (o ouvert ou bref)", w.lower(), f"{w} -> {p}")
        # 5. Mots lus comme une autre langue.
        for p, _, _ in espeakbridge.get_phonemes(plain):
            for lang in re.findall(r"\((\w+)\)", p):
                if lang != "fr":
                    flag("mot lu dans une autre langue", p, f"({lang}) {p}   ({s})")
        # 6. « l'est » (point cardinal) : espeak le lit comme le verbe être.
        if re.search(r"\bl['’]est\b", plain) and "ˈɛst" not in ph:
            flag("« l'est » lu comme le verbe", s, s)
    found["-ent lus « an » (tous, pour relecture)"] = {w: f"{w} ×{n}" for w, n in sorted(nasal_words.items())}

    out = HOME / "audit-prononciation.txt"
    lines = [f"Audit de prononciation — {len(segs)} phrases, lexique : {len(LEXICON)} entrées", ""]
    for cat, items in found.items():
        lines.append(f"## {cat} ({len(items)})")
        lines += [f"  {v}" for v in items.values()] + [""]
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print("rapport :", out)


def main():
    if "--samples" in sys.argv:
        return samples()
    if "--audit" in sys.argv:
        return audit()
    AUDIO.mkdir(exist_ok=True)
    segs = all_segments()
    spoken = json.loads(SPOKEN.read_text(encoding="utf-8")) if SPOKEN.exists() else {}
    voice = None
    made = redone = 0
    for s in segs:
        key = clip_key(s)
        target = AUDIO / f"{key}.m4a"
        say = SIG + to_speech(s)
        # Clip enregistré avant spoken.json : il a été prononcé avec les seules règles de base.
        before = spoken.get(key, base_speech(s)) if target.exists() else None
        if before == say:
            spoken[key] = say
            continue
        if ENGINE == "apple":
            synth_apple(say[len(SIG):], target)
        else:
            voice = voice or load(CONF["voice"])
            if before is not None and voice.phonemize(before) == voice.phonemize(say):
                spoken[key] = say  # graphie différente, mêmes phonèmes : le clip reste bon
                continue
            synth(voice, say, target)
        spoken[key] = say
        if before is None:
            made += 1
        else:
            redone += 1
            if ENGINE != "apple":
                print(f"refait : {s}\n      -> {say}")
    keys = sorted({clip_key(s) for s in segs})
    # Les fichiers qui ne correspondent plus à aucune phrase sont retirés.
    for f in AUDIO.glob("*.m4a"):
        if f.stem not in keys:
            f.unlink()
    (AUDIO / "manifest.json").write_text(json.dumps({"voice": APPLE["voice"] if ENGINE == "apple" else CONF["voice"], "clips": keys}), encoding="utf-8")
    SPOKEN.write_text(json.dumps({k: spoken[k] for k in keys}, ensure_ascii=False, indent=0) + "\n",
                      encoding="utf-8")
    print(f"{len(segs)} phrases, {made} nouvelles enregistrées, {redone} réenregistrées")
    if redone:
        print("Des clips ont changé sous le même nom : incrémenter CACHE dans sw.js pour que l'iPad les recharge.")


if __name__ == "__main__":
    main()
