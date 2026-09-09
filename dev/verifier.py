#!/usr/bin/env python3
"""Rejoue l'étape 1 de docs/TESTING.md en une commande.

    python3 dev/verifier.py

Le script ne contient aucune liste d'ambiances, de lumières ou de playlists :
il les lit dans le dépôt. scripts.yaml dit quelle scène chaque ambiance
allume, scenes.yaml dit ce que cette scène fait aux lumières, et c'est cela
qui est comparé à l'état réel de Home Assistant. Ajouter une ambiance ou
changer une luminosité ne demande donc pas de toucher à ce fichier — sinon il
finirait par valider une vérité qui n'est plus celle du dépôt.

Sortie 0 si tout passe, 1 sinon.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

import yaml

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HA = os.path.join(RACINE, "homeassistant")

VERT, ROUGE, JAUNE, GRIS, RAZ = "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[0m"

echecs = []
notes = []


def ok(msg):
    print("  {}✓{} {}".format(VERT, RAZ, msg))


def echec(msg):
    print("  {}✗{} {}".format(ROUGE, RAZ, msg))
    echecs.append(msg)


def note(msg):
    print("  {}·{} {}".format(JAUNE, RAZ, msg))
    notes.append(msg)


def titre(msg):
    print("\n{}".format(msg))


# --- Home Assistant -------------------------------------------------------


def lire_env():
    chemin = os.path.join(RACINE, "app", ".env")
    if not os.path.exists(chemin):
        sys.exit(
            "app/.env est absent. Copiez app/.env.example, puis renseignez "
            "VITE_HA_URL et VITE_HA_TOKEN (docs/TESTING.md, étape 1.3)."
        )
    env = {}
    with open(chemin) as f:
        for ligne in f:
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#") and "=" in ligne:
                cle, _, valeur = ligne.partition("=")
                env[cle.strip()] = valeur.strip()
    manquant = [c for c in ("VITE_HA_URL", "VITE_HA_TOKEN") if not env.get(c)]
    if manquant:
        sys.exit("app/.env : {} non renseigné.".format(", ".join(manquant)))
    return env["VITE_HA_URL"].rstrip("/"), env["VITE_HA_TOKEN"]


class Client:
    def __init__(self, url, token):
        self.url, self.token = url, token

    def _appel(self, chemin, donnees=None):
        req = urllib.request.Request(
            self.url + chemin,
            data=json.dumps(donnees).encode() if donnees is not None else None,
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            corps = r.read().decode()
        return json.loads(corps) if corps else None

    def etat(self, entity_id):
        try:
            return self._appel("/api/states/" + entity_id)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise

    def service(self, domaine, service, donnees):
        return self._appel("/api/services/{}/{}".format(domaine, service), donnees)

    def converser(self, texte):
        """Ce qu'Assist répond à une phrase tapée — sans micro, sans whisper."""
        return self._appel("/api/conversation/process", {"text": texte, "language": "fr"})


# --- lecture du dépôt -----------------------------------------------------


def charger(nom):
    with open(os.path.join(HA, nom)) as f:
        return yaml.safe_load(f)


def scene_de_l_ambiance(corps):
    """L'entity_id de la scène qu'allume une ambiance, d'après scripts.yaml."""
    for etape in corps.get("sequence", []):
        action = etape.get("service") or etape.get("action")
        if action == "scene.turn_on":
            cible = etape.get("target", {}).get("entity_id")
            if isinstance(cible, str):
                return cible
    return None


def config_ts():
    """Les entity_id que l'app utilise réellement, lus dans src/config.ts."""
    with open(os.path.join(RACINE, "app", "src", "config.ts")) as f:
        source = f.read()
    # Seulement le tableau MOODS : PLAYERS et DEVICES ont aussi des `id:`,
    # et ce ne sont pas des ambiances.
    bloc_moods = re.search(r"MOODS\s*=\s*\[(.*?)\];", source, re.S)
    moods = re.findall(r'id:\s*"([^"]+)"', bloc_moods.group(1) if bloc_moods else "")
    bloc = re.search(r"LIGHTS\s*=\s*\[(.*?)\]", source, re.S)
    lumieres = re.findall(r'"([^"]+)"', bloc.group(1)) if bloc else []
    select = re.search(r'PLAYLIST_SELECT\s*=\s*"([^"]+)"', source)
    mood_select = re.search(r'MOOD_SELECT\s*=\s*"([^"]+)"', source)
    # Le réveil : ses helpers et ses scripts viennent de packages/reveil.yaml,
    # et l'app les nomme tous dans le bloc REVEIL.
    bloc_reveil = re.search(r"REVEIL\s*=\s*\{(.*?)\}", source, re.S)
    reveil = re.findall(r'"([^"]+)"', bloc_reveil.group(1)) if bloc_reveil else []
    # Le climat : les capteurs, simulés en dev, que la carte Climat affiche.
    bloc_climat = re.search(r"CLIMAT\s*=\s*\{(.*?)\}", source, re.S)
    reveil += re.findall(r'"([^"]+)"', bloc_climat.group(1)) if bloc_climat else []
    return (moods, lumieres,
            select.group(1) if select else None,
            mood_select.group(1) if mood_select else None,
            reveil)


def etapes_son(corps):
    """Les étapes d'une ambiance qui touchent au son — celles qui échouent
    tant que Music Assistant n'est pas branché (étape 1.6)."""
    sons = []
    for etape in corps.get("sequence", []):
        action = etape.get("service") or etape.get("action") or ""
        if action.startswith(("media_player.", "music_assistant.")) or action == "script.play_playlist":
            sons.append(action)
    return sons


# --- vérifications --------------------------------------------------------


def verifier_logs():
    titre("Logs Home Assistant — une erreur de YAML fait disparaître un bloc en silence")
    try:
        # Uniquement le démarrage courant : les erreurs d'un lancement
        # précédent ont pu être corrigées depuis, et les relire ferait échouer
        # un dépôt sain jusqu'au prochain « down ».
        depuis = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.StartedAt}}", "casa-hass"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        cmd = ["docker", "compose", "-f", "docker-compose.dev.yml", "logs", "homeassistant"]
        if depuis:
            cmd += ["--since", depuis]
        sortie = subprocess.run(
            cmd, cwd=RACINE, capture_output=True, text=True, timeout=120
        ).stdout
    except (OSError, subprocess.SubprocessError):
        note("docker indisponible — contrôle des logs sauté")
        return
    fautives = [
        l for l in sortie.splitlines()
        if "ERROR" in l and re.search(r"scenes\.yaml|scripts\.yaml|input_selects\.yaml|"
                                      r"configuration\.yaml|Invalid config|template", l)
    ]
    # Les erreurs musicales sont attendues tant que Music Assistant n'est pas
    # branché (étape 1.6) : elles ne disent rien sur le YAML du dépôt.
    fautives = [l for l in fautives if "music_assistant" not in l]
    if fautives:
        echec("{} erreur(s) de configuration dans les logs :".format(len(fautives)))
        for l in fautives[-5:]:
            print("      {}{}{}".format(GRIS, l.strip()[:160], RAZ))
    else:
        ok("aucune erreur de configuration")


def verifier_echo_des_ambiances(moods, mood_select):
    titre("Chaque ambiance écrit l'écho qui la confirme dans l'app")
    scripts = charger("scripts.yaml")
    options = charger("input_selects.yaml")["mood"]["options"]
    for mood in moods:
        court = mood.split(".", 1)[1]
        seq = scripts.get(court, {}).get("sequence", [])
        derniere = seq[-1] if seq else {}
        cible = derniere.get("target", {}).get("entity_id")
        option = str(derniere.get("data", {}).get("option", ""))
        # En dernière étape, et pas ailleurs : l'écho ne doit partir que si
        # tout ce qui précède a marché, le son compris.
        if cible == mood_select and "this.entity_id" in option:
            ok("{} se confirme en dernière étape".format(mood))
        else:
            echec("{} : la dernière étape n'écrit pas {} — l'app attendra l'écho "
                  "pour rien".format(mood, mood_select))
        if mood not in options:
            echec("{} n'est pas une option de {} dans input_selects.yaml".format(mood, mood_select))


def verifier_entites(cli, moods, lumieres, select, mood_select, reveil):
    titre("Les entités que l'app attend existent")
    for eid in lumieres + moods + [select, mood_select, "script.play_playlist"] + reveil:
        if cli.etat(eid) is None:
            echec("{} est absente (src/config.ts la référence)".format(eid))
        else:
            ok(eid)


def verifier_playlists(cli, select):
    titre("Les playlists : la liste vit sur le Pi, pas dans le build")
    attendues = charger("input_selects.yaml")["playlist"]["options"]
    uris = charger("scripts.yaml")["play_playlist"]["variables"]["playlists"]
    etat = cli.etat(select)
    recues = etat["attributes"]["options"] if etat else []
    if recues == attendues:
        ok("{} reçues par l'app : {}".format(len(recues), ", ".join(recues)))
    else:
        echec("input_selects.yaml annonce {} mais l'app reçoit {}".format(attendues, recues))
    # Un nom sans URI serait un bouton qui ne joue rien.
    for nom in attendues:
        if nom not in uris:
            echec("« {} » est proposé sans URI dans script.play_playlist".format(nom))
    if all(n in uris for n in attendues):
        ok("chaque nom proposé a son URI")


def verifier_ambiances(cli, moods, mood_select):
    titre("Chaque ambiance met les lumières dans l'état décrit par scenes.yaml")
    scripts = charger("scripts.yaml")
    scenes = {s["id"]: s for s in charger("scenes.yaml")}

    for mood in moods:
        court = mood.split(".", 1)[1]
        corps = scripts.get(court)
        if corps is None:
            echec("{} est dans config.ts mais pas dans scripts.yaml".format(mood))
            continue
        cible = scene_de_l_ambiance(corps)
        if not cible:
            note("{} n'allume aucune scène — rien à comparer".format(mood))
            continue
        scene = scenes.get(cible.split(".", 1)[1])
        if scene is None:
            echec("{} appelle {}, absente de scenes.yaml".format(mood, cible))
            continue

        # Remis à « aucune » avant chaque ambiance : un écho resté d'un tour
        # précédent passerait pour celui de celle-ci.
        cli.service("input_select", "select_option", {"entity_id": mood_select, "option": "aucune"})
        cli.service("script", "turn_on", {"entity_id": mood})
        time.sleep(3)

        ecarts = []
        for eid, voulu in scene["entities"].items():
            if not eid.startswith("light."):
                continue  # les media_player relèvent de l'étape 3
            reel = cli.etat(eid)
            if reel is None:
                ecarts.append("{} absente".format(eid))
                continue
            if reel["state"] != voulu["state"]:
                ecarts.append("{} {} au lieu de {}".format(eid, reel["state"], voulu["state"]))
                continue
            attendu_lum = voulu.get("brightness")
            if attendu_lum is not None:
                obtenu = reel["attributes"].get("brightness")
                if obtenu != attendu_lum:
                    ecarts.append("{} luminosité {} au lieu de {}".format(eid, obtenu, attendu_lum))
        if ecarts:
            echec("{} ({}) : {}".format(mood, scene["name"], " ; ".join(ecarts)))
        else:
            ok("{} ({}) : lumières".format(mood, scene["name"]))

        # L'écho n'arrive que si tout le script a marché. Sans Music Assistant
        # la moitié son échoue avant — attendu jusqu'en 1.6, et pas un défaut
        # du dépôt. À l'étape 3, chaque ambiance doit se confirmer.
        echo = cli.etat(mood_select)
        confirme = echo is not None and echo["state"] == mood
        sons = etapes_son(corps)
        if confirme:
            ok("{} : écho reçu, l'app le verrait confirmé".format(mood))
        elif sons:
            note("{} : pas d'écho — le son a échoué avant ({}) ; attendu avant 1.6".format(
                mood, ", ".join(sorted(set(sons)))))
        else:
            echec("{} : pas d'écho alors que rien ne touche au son".format(mood))


def verifier_ajout_a_chaud(cli, select):
    titre("Ajouter une playlist ne demande pas de reconstruire l'app")
    chemin = os.path.join(HA, "input_selects.yaml")
    with open(chemin) as f:
        original = f.read()
    temoin = "Témoin du vérificateur"
    try:
        # Par le YAML parsé, pas en ajoutant une ligne à la fin : le fichier
        # contient plusieurs listes, et la dernière n'est pas forcément celle
        # des playlists. Les commentaires disparaissent de cette version
        # temporaire ; l'original est remis en place juste après.
        contenu = yaml.safe_load(original)
        contenu["playlist"]["options"].append(temoin)
        with open(chemin, "w") as f:
            yaml.safe_dump(contenu, f, allow_unicode=True, sort_keys=False)
        cli.service("input_select", "reload", {})
        time.sleep(3)
        vues = cli.etat(select)["attributes"]["options"]
        if temoin in vues:
            ok("le nom ajouté apparaît côté app sans rebuild")
        else:
            echec("le nom ajouté n'est pas remonté : {}".format(vues))
    finally:
        with open(chemin, "w") as f:
            f.write(original)
        cli.service("input_select", "reload", {})
        time.sleep(2)
        if cli.etat(select)["attributes"]["options"] == charger("input_selects.yaml")["playlist"]["options"]:
            ok("input_selects.yaml restauré")
        else:
            echec("input_selects.yaml n'a pas retrouvé son état — vérifiez git status")


def verifier_phrases_vocales(cli):
    titre("Chaque phrase d'Assist a un intent qui la traite")
    # custom_sentences/fr/ est lu par Home Assistant ET par Speech-to-Phrase.
    # Une phrase dont l'intent n'existe dans aucun intent_script serait
    # entendue, reconnue, et suivie de « désolé, je n'ai pas compris ».
    for nom in sorted(os.listdir(os.path.join(HA, "custom_sentences", "fr"))):
        if not nom.endswith(".yaml"):
            continue
        with open(os.path.join(HA, "custom_sentences", "fr", nom)) as f:
            fichier = yaml.safe_load(f)
        intents = fichier.get("intents", {})
        listes = fichier.get("lists", {})

        def premiere_forme(gabarit):
            """La première forme d'un gabarit hassil : sans les crochets,
            la première branche de chaque parenthèse."""
            t = re.sub(r"\[[^\]]*\]", "", gabarit)
            t = re.sub(r"\(([^|)]*)\|[^)]*\)", r"\1", t)
            return re.sub(r"\s+", " ", t).strip()

        def valeur(nom_liste):
            liste = listes.get(nom_liste, {})
            if "values" in liste:
                v = liste["values"][0]
                return premiere_forme(v["in"] if isinstance(v, dict) else v)
            return "sept"  # un « range » : n'importe quel nombre en lettres

        for intent, corps in intents.items():
            phrase = corps["data"][0]["sentences"][0]
            texte = premiere_forme(re.sub(r"\{([^}]+)\}", lambda m: valeur(m.group(1)), phrase))
            reponse = cli.converser(texte)
            genre = ((reponse or {}).get("response") or {}).get("response_type")
            if genre == "action_done":
                ok("{} : « {} »".format(intent, texte))
            else:
                echec("{} : « {} » → {}".format(intent, texte, genre or "pas de réponse"))


def verifier_build():
    titre("L'app compile, et le jeton entre bien dans le bundle")
    app = os.path.join(RACINE, "app")
    if not os.path.isdir(os.path.join(app, "node_modules")):
        note("node_modules absent — lancez npm install dans app/")
        return
    r = subprocess.run(["npm", "run", "build"], cwd=app, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        echec("npm run build échoue :")
        print("      {}{}{}".format(GRIS, (r.stderr or r.stdout).strip()[-500:], RAZ))
        return
    ok("npm run build (tsc inclus)")
    _, token = lire_env()
    dist = os.path.join(app, "dist", "assets")
    fondu = any(
        token[:40] in open(os.path.join(dist, n), encoding="utf-8", errors="ignore").read()
        for n in os.listdir(dist) if n.endswith(".js")
    ) if os.path.isdir(dist) else False
    # Le jeton est figé par import.meta.env au moment du build : s'il n'y est
    # pas, l'app native se connectera dans le vide.
    ok("jeton embarqué par import.meta.env") if fondu else echec("jeton absent du bundle")


def main():
    url, token = lire_env()
    cli = Client(url, token)
    print("Home Assistant : {}".format(url))
    try:
        cli.etat("person.nobody")
    except urllib.error.HTTPError as e:
        sys.exit("Authentification refusée ({}). Le jeton de app/.env n'est plus valide "
                 "ou vise une autre installation.".format(e.code))
    except OSError as e:
        sys.exit("Home Assistant injoignable sur {} ({}). "
                 "docker compose -f docker-compose.dev.yml up -d".format(url, e))

    moods, lumieres, select, mood_select, reveil = config_ts()
    verifier_logs()
    verifier_entites(cli, moods, lumieres, select, mood_select, reveil)
    verifier_playlists(cli, select)
    verifier_echo_des_ambiances(moods, mood_select)
    verifier_ambiances(cli, moods, mood_select)
    verifier_ajout_a_chaud(cli, select)
    verifier_phrases_vocales(cli)
    verifier_build()

    print()
    if echecs:
        print("{}{} échec(s).{} Le son (1.6) et les étapes 2-3 ne sont pas couverts ici.".format(
            ROUGE, len(echecs), RAZ))
        return 1
    print("{}Étape 1 vérifiée.{} Restent le son (1.6), puis les étapes 2 et 3.".format(VERT, RAZ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
