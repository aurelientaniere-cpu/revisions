#!/usr/bin/env python3
"""Enregistre toutes les phrases de l'app avec la voix Piper (100 % local, sans réseau).

Usage :
  ~/.revisions-cm1/venv/bin/python tools/voice.py            # enregistre les phrases manquantes
  ~/.revisions-cm1/venv/bin/python tools/voice.py --samples  # extraits pour choisir la voix

Outillage hors du dossier Google Drive (espeak refuse les chemins trop longs) :
  ~/.revisions-cm1/venv    Python + Piper (installé depuis tools/requirements.txt, empreintes figées)
  ~/.revisions-cm1/voices  voix .onnx (empreintes dans tools/voices.sha256)

Entrées : phrases.json, lessons/build/*.json (voir tools/build.py), tools/voice.json
Sortie  : audio/<empreinte>.m4a + audio/manifest.json
"""
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


def to_speech(text):
    """Même règle que toSpeech() dans js/speech.js."""
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
    for f in sorted((ROOT / "lessons" / "build").glob("*.json")):
        segs.update(json.loads(f.read_text(encoding="utf-8"))["speech"])
    return sorted(s for s in segs if s)


def synth(voice, text, out_m4a, speaker=None):
    cfg = SynthesisConfig(
        speaker_id=speaker if speaker is not None else CONF.get("speaker_id"),
        length_scale=CONF.get("length_scale"),
        noise_scale=CONF.get("noise_scale"),
        noise_w_scale=CONF.get("noise_w_scale"),
    )
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            voice.synthesize_wav(to_speech(text), w, syn_config=cfg)
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
        synth(voice, text, out / f"{label}.m4a", speaker)
        print("extrait :", out / f"{label}.m4a")


def main():
    if "--samples" in sys.argv:
        return samples()
    AUDIO.mkdir(exist_ok=True)
    segs = all_segments()
    voice = None
    made = 0
    for s in segs:
        target = AUDIO / f"{clip_key(s)}.m4a"
        if target.exists():
            continue
        voice = voice or load(CONF["voice"])
        synth(voice, s, target)
        made += 1
    keys = sorted({clip_key(s) for s in segs})
    # Les fichiers qui ne correspondent plus à aucune phrase sont retirés.
    for f in AUDIO.glob("*.m4a"):
        if f.stem not in keys:
            f.unlink()
    (AUDIO / "manifest.json").write_text(json.dumps({"voice": CONF["voice"], "clips": keys}), encoding="utf-8")
    print(f"{len(segs)} phrases, {made} nouvelles enregistrées")


if __name__ == "__main__":
    main()
