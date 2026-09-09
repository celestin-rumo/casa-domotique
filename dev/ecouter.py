#!/usr/bin/env python3
"""Tester la reconnaissance sans micro.

piper prononce chaque phrase, puis on la fait écouter à whisper et à
Speech-to-Phrase, en mesurant le temps entre la fin de l'audio et la
transcription. C'est la seule façon de voir ce que chaque moteur ÉCRIT —
« 7h30 » chez whisper, « 7 heures 30 » chez Speech-to-Phrase — avant que
Home Assistant tente de le comprendre.

À lancer DANS le conteneur casa-hass, qui a la lib wyoming et voit les
services par leur nom :

    docker cp dev/ecouter.py casa-hass:/tmp/ecouter.py
    docker exec casa-hass python3 /tmp/ecouter.py "réveille-moi à sept heures trente" "je suis debout"

Ce que ça ne teste pas : le micro, le mot d'appel, et la chaîne complète
dans Home Assistant — pour ça, l'assistant de docs/TESTING.md 1.9.
"""
import asyncio
import sys
import time

from wyoming.asr import Transcribe, Transcript
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.client import AsyncTcpClient
from wyoming.tts import Synthesize

MOTEURS = [("whisper", "whisper", 10300), ("speech-to-phrase", "speech-to-phrase", 10300)]


async def dire(texte):
    async with AsyncTcpClient("piper", 10200) as c:
        await c.write_event(Synthesize(text=texte).event())
        rate = width = channels = None
        morceaux = []
        while True:
            ev = await c.read_event()
            if ev is None:
                break
            if AudioStart.is_type(ev.type):
                a = AudioStart.from_event(ev)
                rate, width, channels = a.rate, a.width, a.channels
            elif AudioChunk.is_type(ev.type):
                morceaux.append(AudioChunk.from_event(ev).audio)
            elif AudioStop.is_type(ev.type):
                break
        return rate, width, channels, b"".join(morceaux)


async def ecouter(hote, port, rate, width, channels, audio):
    async with AsyncTcpClient(hote, port) as c:
        await c.write_event(Transcribe(language="fr").event())
        await c.write_event(AudioStart(rate=rate, width=width, channels=channels).event())
        for i in range(0, len(audio), 4096):
            await c.write_event(
                AudioChunk(rate=rate, width=width, channels=channels, audio=audio[i:i + 4096]).event()
            )
        await c.write_event(AudioStop().event())
        debut = time.monotonic()
        while True:
            ev = await c.read_event()
            if ev is None:
                return None, time.monotonic() - debut
            if Transcript.is_type(ev.type):
                return Transcript.from_event(ev).text, time.monotonic() - debut


async def main(phrases):
    if not phrases:
        sys.exit("Donnez une ou plusieurs phrases à prononcer.")
    for phrase in phrases:
        rate, width, channels, audio = await dire(phrase)
        duree = len(audio) / (rate * width * channels)
        print("\n« {} »  (audio piper : {:.1f} s)".format(phrase, duree))
        for nom, hote, port in MOTEURS:
            try:
                texte, t = await ecouter(hote, port, rate, width, channels, audio)
                print("  {:<17} {:5.2f} s  → {!r}".format(nom, t, texte))
            except OSError as e:
                print("  {:<17} injoignable : {}".format(nom, e))


asyncio.run(main(sys.argv[1:]))
