# Tester, en trois étapes

Chaque étape ajoute une source de panne et une seule. C'est tout l'intérêt de
les séparer : quand quelque chose casse à l'étape 2, on sait que ce n'est ni le
YAML ni l'app, puisque l'étape 1 les a déjà prouvés.

| | Machine | Lumières | Son | Ce que l'étape prouve |
|---|---|---|---|---|
| **1** | Portable | fausses | fichier local | Le YAML, les scripts, l'app, le mécanisme des playlists |
| **2** | Raspberry Pi | fausses | fichier local | Le Pi, le réseau, l'app native sur le natel |
| **3** | Raspberry Pi | Hue · Zigbee | Sonos · Spotify | Le matériel, et lui seul |

---

# Étape 1 — tout est faux

Aucun Raspberry Pi, aucune ampoule, aucune enceinte. Deux conteneurs sur le
poste de dev. `dev/configuration.yaml` inclut les fichiers du dépôt et déclare
trois *template lights* adossées à des `input_boolean` : `light.salon` existe
sans qu'aucune ampoule soit branchée.

Le dépôt n'est jamais écrit par Home Assistant — `homeassistant/` est monté en
**lecture seule** sur `/config/casa`, et la base, les journaux et les secrets
vont dans un volume Docker.

## 1.1 Démarrer

```bash
docker compose -f docker-compose.dev.yml up
```

Le premier démarrage prend quelques minutes : Home Assistant installe ses
dépendances avant d'ouvrir le port.

## 1.2 Lire les logs avant d'ouvrir quoi que ce soit

L'étape que tout le monde saute, et celle qui attrape presque tout. **Une
erreur de YAML n'empêche pas Home Assistant de démarrer** : elle fait
disparaître le bloc fautif en silence. Sans ce contrôle, on se retrouve avec
une app qui se connecte parfaitement et n'affiche aucune playlist, sans le
moindre indice.

```bash
docker compose -f docker-compose.dev.yml logs homeassistant \
  | grep -E "ERROR|Invalid config" \
  | grep -vE "music_assistant|media_player\.ma_|never retrieved"
```

Aucune ligne = tout est chargé. Une ligne citant `template`, `scenes.yaml`,
`scripts.yaml` ou `input_selects.yaml` = un bloc a disparu.

`restart` conserve les logs des démarrages précédents : après avoir corrigé un
YAML, l'erreur d'avant reste visible et fait croire qu'elle persiste. Ajoutez
`--since "$(docker inspect -f '{{.State.StartedAt}}' casa-hass)"` à `logs`
pour ne lire que le démarrage courant — c'est ce que fait `dev/verifier.py`.

Le second `grep -v` retire un bruit attendu : dès qu'une ambiance a été
déclenchée, sa moitié « son » échoue avec `Action music_assistant.play_media
not found`, suivi d'une trace Python d'une soixantaine de lignes. C'est normal
jusqu'à l'étape 1.6 — les lumières sont appliquées en position 1 du script,
avant que la musique n'échoue en position 3. Ne cherchez pas de panne dans
cette trace, il n'y en a pas.

## 1.3 Un compte et un jeton

1. <http://localhost:8123> — créer le compte au premier écran.
2. Profil (en bas à gauche) → **Sécurité** → **Jetons d'accès de longue durée**.
   Le copier tout de suite : il ne s'affiche qu'une fois.

## 1.4 Vérifier chaque couche, sans l'app

```bash
TOKEN=collez_le_jeton_ici
H="Authorization: Bearer $TOKEN"
```

Ces deux variables ne vivent que dans ce terminal. Un `401` sur les commandes
qui suivent, c'est presque toujours un nouveau terminal où `H` n'existe plus :
`echo "$H"` doit afficher le jeton. Une fois `app/.env` rempli (1.5), le plus
sûr est d'y puiser :
`H="Authorization: Bearer $(grep VITE_HA_TOKEN app/.env | cut -d= -f2)"`.

```bash
# les fausses ampoules existent
curl -s -H "$H" http://localhost:8123/api/states/light.salon
# → {"entity_id":"light.salon","state":"off", ...}

# la liste des playlists, telle que l'app la lira
curl -s -H "$H" http://localhost:8123/api/states/input_select.playlist
# → "attributes":{"options":["Détente"], ...}

# les scripts sont enregistrés
curl -s -H "$H" http://localhost:8123/api/states/script.play_playlist

# une ambiance change vraiment l'état des lumières
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"entity_id":"script.mood_detente"}' \
  http://localhost:8123/api/services/script/turn_on
curl -s -H "$H" http://localhost:8123/api/states/light.salon
# → "state":"on"
```

La moitié « son » de l'ambiance échoue tant que Music Assistant n'est pas
branché (1.6). C'est attendu, et le reste s'applique quand même.

## 1.5 L'app

```bash
cd app && npm install && cp .env.example .env
```

Dans `.env` : `VITE_HA_URL=http://localhost:8123` et le jeton de 1.3. Puis
`npm run dev`.

Attendu : les six ambiances, les trois lumières qui réagissent pour de vrai,
et **trois playlists dans la liste** — Détente, Chillos et Focus. Un nom
n'apparaît que si son URI est dans la table de `script.play_playlist` : une
entrée sans adresse serait un bouton qui ne joue rien.

Un appui sur une ambiance l'allume tout de suite, contour qui respire, jusqu'à
l'écho de `input_select.mood`. Sans Music Assistant, **Détente, Focus et
Chillos reviennent en arrière après six secondes** avec une ligne qui nomme le
script — leur son a échoué avant l'écho, c'est l'état réel. Cinéma et Tout
éteindre se confirment. Si un bouton restait allumé sans écho, ce serait le
défaut, pas l'inverse.

Quatre onglets. **Pièces** : chaque lumière a son interrupteur et son
intensité ; « Avancé » n'apparaît que si l'ampoule sait faire du blanc réglable
ou de la couleur — les fausses ampoules ne savent que l'intensité, donc pas
d'« Avancé » avant l'étape 3. **Écoute** dit « Enceinte absente » avec
`media_player.ma_salon` en toutes lettres tant que 1.6 n'est pas fait.
**Réglages** liste chaque entité de `config.ts` avec ce que le Pi en dit :
« liée » ou « absente » vient de Home Assistant, pas d'une pastille écrite à la
main — c'est là qu'on voit d'un coup d'œil ce qui reste à brancher.

Coupez le conteneur (`docker stop casa-hass`) : le point passe à l'ambre et
nomme l'hôte. Relancez-le : il repasse au vert tout seul.

Si `npm run dev` s'arrête sur `ENOSPC: System limit for number of file
watchers reached`, ce n'est pas le projet : c'est la machine. Regardez d'abord
les *instances*, pas les watchers — c'est presque toujours celle-là qui sature
quand plusieurs projets tournent en parallèle.

```bash
cat /proc/sys/fs/inotify/max_user_instances                     # souvent 128
find /proc/*/fd -lname anon_inode:inotify 2>/dev/null | wc -l   # combien sont prises
sudo sysctl -w fs.inotify.max_user_instances=512                # jusqu'au reboot
```

Pour que ça tienne : `fs.inotify.max_user_instances=512` dans
`/etc/sysctl.d/99-inotify.conf`.

## 1.6 Le son, sans compte Spotify

L'intégration Music Assistant **ne se configure pas en YAML**. C'est une
« config entry » : elle vit dans le `.storage/` de Home Assistant, son état
interne, et ne peut donc pas être livrée dans ce dépôt. Ces quatre étapes sont
manuelles, une fois.

`dev/music/` est monté sur `/media` et contient `signal-de-test.wav`, trois
secondes de notes montantes — de quoi entendre que la chaîne joue sans ouvrir
de compte nulle part. Déposez-y vos fichiers si vous préférez.

Music Assistant a **deux adresses, à ne pas échanger** :

| Qui parle | Adresse | Pourquoi |
|---|---|---|
| Votre navigateur | `http://localhost:8095` | le port publié sur la machine |
| Home Assistant | `http://music-assistant:8095` | le nom du service dans le compose, résolu par le DNS interne de Docker — **inconnu de votre machine**, donc inutilisable dans un navigateur |

Depuis le natel ou un autre poste, `localhost` désigne cet appareil-là :
mettez l'IP du poste de dev (`hostname -I`).

**Sauf pour l'intégration elle-même.** Depuis Music Assistant 2.10, le
serveur a un compte, et pour relier Home Assistant, l'intégration **ouvre
la page de connexion de Music Assistant dans votre navigateur**, à
l'adresse que vous avez tapée. `http://music-assistant:8095` y donne « ce
site est inaccessible » : le nom n'existe que pour Docker. Il faut une
adresse que le navigateur ET Home Assistant atteignent : **l'IP du poste**,
`http://192.168.1.119:8095` par exemple. Le conteneur la joint par le port
publié. Vérifié le 8 septembre 2026, sur Music Assistant 2.10.2.

**a.** Home Assistant → Paramètres → Appareils et services → Ajouter une
intégration → **Music Assistant**, serveur `http://IP-du-poste:8095`. La
page de connexion de Music Assistant s'ouvre : le compte créé au premier
passage (b), puis retour automatique à Home Assistant.

**b.** <http://localhost:8095> — le premier passage ouvre l'assistant de
configuration (`/setup`) ; le terminer. Puis Paramètres → Fournisseurs de
musique → **Filesystem**, dossier `/media`. Indexer : `signal-de-test.wav`
doit apparaître.

**c.** Activer le lecteur intégré de Music Assistant, qui joue dans l'onglet du
navigateur. Il remonte alors dans Home Assistant comme une entité
`media_player.*`.

**d. Le renommer — l'étape qui fait tout marcher.** Home Assistant →
Paramètres → Entités → ce lecteur → Paramètres → **changer l'ID d'entité** en
`media_player.ma_salon`.

À partir de là `scripts.yaml`, `config.ts` et les ambiances marchent **sans
être modifiés**. L'alternative — éditer le dépôt pour viser le nom automatique
du lecteur — finit toujours par être committée par erreur et à casser la prod.

**e.** Les URI de `script.play_playlist` sont des playlists Spotify : sans
compte, aucune ne résout. Pour un essai local, trouvez d'abord un `media_id`
que Music Assistant accepte — Outils de développement → Actions →
`music_assistant.play_media`, cible `media_player.ma_salon`. Puis ajoutez-le à
la table sous le nom `Test`, et `Test` dans `input_selects.yaml`.

## 1.7 Le test qui justifie toute l'architecture

Ajoutez un nom dans `homeassistant/input_selects.yaml`, rechargez (Outils de
développement → YAML), et regardez-le apparaître **dans l'app sans l'avoir
reconstruite**. C'est la propriété pour laquelle la liste vit sur le Pi plutôt
que dans le build.

## 1.8 Tout ce qui précède, en une commande

```bash
python3 dev/verifier.py
```

Rejoue 1.2, 1.4, 1.5 et 1.7 avec le jeton de `app/.env` : logs du démarrage
courant, existence des entités que `config.ts` référence — le réveil
compris —, playlists reçues et
chacune avec son URI, les six ambiances comparées à `scenes.yaml`, l'ajout à
chaud, et le build de l'app avec le jeton dedans. Sortie 0 si tout passe.

Le script ne contient aucune liste : il lit `scripts.yaml` pour savoir quelle
scène chaque ambiance allume, et `scenes.yaml` pour ce que cette scène doit
faire. Changer une luminosité ou ajouter une ambiance ne demande donc pas de
le modifier — et s'il diverge de Home Assistant, c'est que le dépôt et le Pi
ne disent plus la même chose, ce qui est précisément l'information voulue.

Il déclenche vraiment les ambiances : lancé sur le Pi à l'étape 3, il allumera
l'appartement.

## 1.9 La voix

Quatre conteneurs de plus dans le compose, que Home Assistant est seul à
parler : **whisper** et **speech-to-phrase** transcrivent ce qu'on dit,
**piper** prononce la réponse, **openwakeword** guette le mot d'appel. Aucun
port publié — Home Assistant les joint par leur nom de service, et un
satellite ne parle qu'à Home Assistant. Le premier démarrage télécharge les
modèles ; `docker logs casa-whisper` doit finir par `Ready`.

Deux moteurs de reconnaissance, parce qu'ils ne servent pas la même machine.
**whisper** transcrit n'importe quoi, et met dix à vingt secondes par phrase
sur un Pi. **Speech-to-Phrase** ne transcrit que les phrases qu'on lui a
apprises — les ordres intégrés sur les entités exposées, qu'il va chercher
lui-même dans Home Assistant, et celles de `homeassistant/custom_sentences/`,
qu'il lit dans le même format que Home Assistant — d'où une réponse en moins
d'une seconde sur un Pi 4. Comme l'assistant ne comprend de toute façon que
ces phrases-là, on ne perd rien. Sur le portable on compare les deux ; sur le
Pi, c'est lui.

Il s'entraîne au démarrage en interrogeant Home Assistant, avec le jeton de
`app/.env` (`env_file` dans le compose), **dans la langue du système** et
celles des assistants vocaux. C'est pour ça que `dev/configuration.yaml`
fixe `language: fr` : un Home Assistant créé en anglais au premier écran
n'apprendrait que l'anglais. `docker logs casa-parole` doit montrer
`Started training: fr_FR-rhasspy`, puis `Ready`. Une phrase ajoutée dans
`custom_sentences/` demande donc de redémarrer les deux : Home Assistant
pour la comprendre, `casa-parole` pour l'entendre.

Comme Music Assistant, leur intégration ne se configure que par l'interface.
Quatre fois Paramètres → Appareils et services → Ajouter une intégration →
**Wyoming Protocol** :

| Hôte | Port | Ce que c'est |
|---|---|---|
| `whisper` | 10300 | la reconnaissance, tout terrain |
| `speech-to-phrase` | 10300 | la reconnaissance, rapide, phrases connues |
| `piper` | 10200 | la voix |
| `openwakeword` | 10400 | le mot d'appel (facultatif sans satellite) |

Puis Paramètres → **Assistants vocaux** → Ajouter un assistant : langue
*Français*, agent de conversation *Home Assistant*, reconnaissance
*speech-to-phrase* (ou *faster-whisper* pour comparer), synthèse *piper* avec
la voix `fr_FR-siwis-medium`. Le définir comme assistant préféré.

Les phrases du dépôt vivent dans `homeassistant/custom_sentences/fr/` — le
compose monte ce dossier là où Home Assistant le cherche, `/config/custom_sentences`,
et pas sous `/config/casa` comme le reste. Elles sont prises au démarrage ;
en modifier une demande un redémarrage. Les intents qu'elles nomment sont
traités par `intent_script` dans `packages/reveil.yaml` et `packages/meteo.yaml`.

D'abord au clavier, sans micro : l'icône Assist en haut à droite, puis taper
`règle le réveil à sept heures trente`. Attendu : « Réveil à 7 heures 30 », et
`input_datetime.reveil_heure` qui vaut `07:30:00`. Ou par l'API, ce qui
n'implique ni whisper ni piper — seulement les phrases :

```bash
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"text":"réveille-moi à six heures","language":"fr"}' \
  http://localhost:8123/api/conversation/process
# → "speech":{"plain":{"speech":"Réveil à 6 heures."}} … "response_type":"action_done"
```

Puis à l'oreille, toujours sans micro : `dev/ecouter.py` fait prononcer une
phrase par piper et la fait écouter aux deux moteurs, avec le temps de
réponse et ce que chacun écrit — c'est là qu'on voit whisper rendre « 7h30 »
et Speech-to-Phrase « 7 heures 30 », et pourquoi `reveil.yaml` accepte les
deux.

```bash
docker cp dev/ecouter.py casa-hass:/tmp/ecouter.py
docker exec casa-hass python3 /tmp/ecouter.py "réveille-moi à sept heures trente"
#   whisper            1.48 s  → ' Réveille-moi 7h30.'
#   speech-to-phrase   0.55 s  → 'réveille-moi à 7 heures 30'
```

Ensuite au micro, depuis le même dialogue : le navigateur n'autorise le micro
que sur `localhost` ou en HTTPS. Depuis le natel en HTTP, il refusera — c'est
le navigateur, pas Home Assistant. Le chemin natel est l'app compagnon Home
Assistant, ou un vrai satellite à l'étape 3 (Home Assistant Voice Preview
Edition, ou un ESP32-S3 sous ESPHome) : lui parle à Home Assistant, qui
parle à whisper et piper.

Les ordres intégrés (« allume le salon », « éteins la cuisine ») demandent
d'**exposer** les entités à Assist : Paramètres → Assistants vocaux →
Exposer. Les phrases du dépôt, elles, n'en ont pas besoin — leurs intents
visent directement les entités.

Les ambiances se lancent aussi à la voix : « mode cinéma », « ambiance
détente », « passe en focus », et les tournures propres à une ambiance,
comme « donne-moi envie de faire l'amour » pour Câlin. La liste
`casa_ambiance` de `custom_sentences/fr/ambiances.yaml` ramène chaque
tournure à un mot, et `packages/ambiances.yaml` ramène le mot au script.
Ajouter une façon de dire, c'est une ligne dans la liste.

Le mot plutôt que l'entity_id, parce que **Speech-to-Phrase transcrit la
valeur de sortie de la liste**, pas les mots entendus : avec
`out: script.mood_calin`, il aurait rendu « script.mood_calin », que Home
Assistant ne relit pas. Avec `out: câlin`, il rend « câlin », qui est aussi
une entrée de la liste. `dev/ecouter.py` le montre.

## 1.10 Le réveil

`homeassistant/packages/reveil.yaml` est un *package* : ses trois réglages,
ses scripts, son automatisation et ses réponses vocales tiennent dans un seul
fichier, fusionné avec le reste par la clé `packages:` des deux
`configuration.yaml`.

| Entité | Rôle |
|---|---|
| `input_datetime.reveil_heure` | l'heure, écrite par l'app ou la voix |
| `input_boolean.reveil_actif` | sonne ou ne sonne pas |
| `input_number.reveil_duree` | minutes du lever, 20 par défaut |
| `script.reveil` | le lever de soleil : `light.chambre` de 2000 K à 4000 K, marche par marche |
| `script.reveil_musique` | la musique, à mi-chemin, de 3 % à 20 % de volume |
| `script.reveil_stop` | « je suis debout » |
| `automation.reveil_lever_de_soleil` | à l'heure dite, si actif, lance `script.reveil` |

La musique n'est pas dans `script.reveil` : il la confie à
`script.reveil_musique` par un `script.turn_on`, qui n'attend pas et dont les
erreurs ne remontent pas. C'est l'inverse des ambiances, et c'est voulu : un
réveil qui n'allume pas parce que Spotify ne répond pas ferait rater le
train. Sans `media_player.ma_chambre`, la lumière se lève et rien ne joue,
sans erreur dans les logs.

Dans l'app, la carte **Réveil** de l'écran Ambiances : l'heure, l'interrupteur,
la durée, et **Essai d'une minute**. Attendu sur les fausses ampoules : deux
marches, `light.chambre` à 100 puis 200 de luminosité, la carte qui dit « le
jour se lève · 39 % » puis « 78 % », et le bouton qui devient **Je suis
debout** tant que `script.reveil` est `on`. Sans app :

```bash
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"entity_id":"script.reveil","variables":{"duree":1}}' \
  http://localhost:8123/api/services/script/turn_on
sleep 20; curl -s -H "$H" http://localhost:8123/api/states/light.chambre
# → "brightness":100, puis 200 vingt secondes plus tard
```

Pour entendre la moitié son en dev, où seule `media_player.ma_salon` existe
(1.6) : Outils de développement → Actions → `script.reveil`, avec
`player: media_player.ma_salon` et `duree: 1`. La musique entre à trente
secondes, presque inaudible, et monte.

Sur le Pi, l'automatisation se déclenche chaque jour à l'heure du helper
tant que le réveil est actif — il n'y a pas de notion de jour de semaine.
Pour ne pas sonner le week-end, ajoutez une condition `time` avec `weekday`
à `automation.reveil_lever_de_soleil`.

## 1.11 La météo du jour

Pas d'intégration MétéoSuisse dans Home Assistant. `packages/meteo.yaml`
interroge l'API que l'app MétéoSuisse utilise elle-même, par NPA, toutes les
trente minutes : `sensor.meteosuisse` porte la température actuelle et, en
attributs, six jours de prévisions. Le NPA est dans `input_text.meteo_npa`,
1700 par défaut — à changer une fois dans Paramètres → Appareils et services
→ Entrées ; le capteur se rafraîchit trente secondes après ce changement, et
trente secondes après chaque démarrage. Avant ça, il vaut `unknown` : c'est
le premier appel, parti avant que le helper existe, et il ne dure pas.

```bash
curl -s -H "$H" http://localhost:8123/api/states/sensor.meteosuisse
# → "state":"17.4", "forecast":[{"dayDate":"2026-09-08","iconDay":2,"temperatureMax":30, …
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"text":"quel temps fait-il aujourd'"'"'hui","language":"fr"}' \
  http://localhost:8123/api/conversation/process
# → "Aujourd'hui, quelques nuages, entre 17 et 30 degrés, pas de pluie. Il fait 17 degrés en ce moment."
```

C'est une API non documentée. Si elle change, Assist répond « Je n'ai pas
les prévisions de MétéoSuisse pour le moment » et c'est `packages/meteo.yaml`
qu'il faut revoir. La correspondance code d'icône → « quelques nuages »
suit la légende des icônes de jour de MétéoSuisse ; un code absent de la
table donne « un ciel changeant », jamais une erreur.

## Ce que l'étape 1 ne peut pas prouver

Le réseau, l'app native, et tout le matériel. D'où les deux étapes suivantes.

---

# Étape 2 — le Pi est réel, les lampes et la sono ne le sont pas

Le Pi tourne sous **Home Assistant OS**, pas sous Docker. C'est un système
qui ne fait que ça : ni SSH, ni compose, ni paquets à installer. Chaque
service que le portable lance en conteneur devient un **module
complémentaire**, posé en un clic depuis l'interface. Le contenu du dépôt,
lui, ne change pas d'une ligne.

Les lumières restent fausses, le son reste le fichier local. Ce qui devient
réel : le Pi, le réseau local, et l'app sur le natel plutôt que dans un
onglet du portable.

Deux choses viennent gratuitement avec Home Assistant OS, et c'étaient les
deux pièges de la voie Docker : la clé Zigbee est vue sans qu'on déclare son
chemin, et les Sonos, la TV et le satellite vocal sont découverts sans
réglage de réseau.

Une chose s'y perd, en revanche, et il faut la connaître avant de graver :
**Home Assistant OS ne sait pas faire du Pi un point d'accès Wi-Fi.** C'est
un système fermé, sans NetworkManager à piloter. La parade au routeur qui
tombe est ailleurs (2.8).

## 2.0 Sur quoi faire tourner le Pi

Home Assistant écrit sa base de données en continu, toutes les quelques
secondes. C'est ce qui décide du support, et le classement n'est pas celui
qu'on croit :

| Support | Verdict |
|---|---|
| **SSD NVMe** sur le connecteur PCIe du Pi 5, via un HAT M.2 | le meilleur, et le plus rapide au démarrage |
| **SSD** 2,5 pouces dans un boîtier USB 3 | très bien, moins cher, un câble de plus |
| **Carte microSD** de bonne qualité, classe A2 | ça marche, et ça meurt en un an ou deux |
| **Clé USB** | **à éviter** : moins bon qu'une carte SD |

La clé USB surprend, mais c'est net : une clé de bureautique n'a presque
pas de répartition d'usure, et c'est la panne la plus racontée des forums
Home Assistant. Une clé USB n'est pas un SSD en boîtier ; seul le second
convient.

Commencer sur carte SD pour prendre en main, puis migrer avec une
sauvegarde, est une voie raisonnable. Repartir de zéro plus tard ne coûte
rien à ce stade.

## 2.1 Graver et démarrer

**Raspberry Pi Imager**, sur le poste de dev. Le chemin dans les menus :

1. Modèle : votre Pi.
2. Système : **Other specific-purpose OS** → **Home Assistant and home
   automation** → **Home Assistant OS**, la version pour votre Pi.
3. Support : la carte ou le disque.

**Ne pas toucher à la roue crantée.** Contrairement à Raspberry Pi OS, ces
réglages ne s'appliquent pas : Home Assistant OS ne veut ni utilisateur, ni
SSH, ni Wi-Fi préconfiguré. Tout se règle ensuite dans l'interface.

**Brancher, de préférence en Ethernet**, et attendre. Le premier démarrage
installe le système et prend de cinq à vingt minutes, sans rien afficher
d'utile sur un écran. La LED verte qui clignote pendant ce temps est la LED
d'activité : elle dit que le Pi lit son disque, pas qu'il a un problème.

**Le port n'est pas 8123.** Sur Home Assistant OS, l'interface répond sur le
**port 80**, donc simplement <http://homeassistant.local>, et le 8123 est
fermé. C'est l'inverse de la pile Docker de l'étape 1, où le 8123 est
publié et le 80 n'existe pas. Constaté le 9 septembre 2026 sur Home
Assistant OS 2026.9.1 : trois essais, connexion refusée sur 8123, réponse
sur 80. Toutes les adresses de cette étape s'écrivent donc **sans port**, et
c'est ce qu'il faut mettre dans `VITE_HA_URL`.

Deux autres façons de trouver le Pi si le nom ne répond pas : le port
**4357**, celui de l'observateur, qui n'existe que sur Home Assistant OS et
répond même quand le reste démarre encore ; et l'annonce mDNS, qui donne
l'adresse et la version :

```bash
avahi-browse -rt _home-assistant._tcp
# → address = [192.168.1.142]  txt = ["base_url=http://192.168.1.142" "version=2026.9.1" …]
```

**Créer le compte, en français.**

L'écran d'accueil demande la langue, le pays et le fuseau : **Français**,
Suisse, Europe/Zurich. Ce n'est pas cosmétique — Speech-to-Phrase s'entraîne
dans la langue du système, et n'apprendrait que l'anglais sans rien dire.

L'accueil est terminé quand cette liste ne contient plus que des `true` :

```bash
curl -s http://IP-du-Pi/api/onboarding
# → [{"step":"user","done":true},{"step":"core_config","done":true}, …]
```

**Fixer l'adresse**, depuis l'interface du routeur : une **réservation
DHCP** sur l'adresse MAC du Pi. Plus durable qu'une IP fixe posée sur le Pi.

## 2.2 Mettre le dépôt sur le Pi

Le dépôt vit dans un sous-dossier de la configuration et Home Assistant
n'écrit jamais dedans, exactement comme sur le portable où c'est un montage
en lecture seule. Il faut donc un terminal.

**D'abord, le mode avancé.** Le module qui donne un terminal n'apparaît pas
dans la boutique sans lui. Cliquer sur son nom d'utilisateur en bas de la
barre latérale, onglet Général, et activer **Mode avancé**. Sans ça, on
cherche longtemps un module qui est bien là.

Puis Paramètres → **Modules complémentaires** → **Boutique** → chercher
**Terminal & SSH**, ou sa version communautaire **Advanced SSH & Web
Terminal**. L'installer, lui donner un mot de passe dans son onglet
Configuration, le démarrer, et cocher « Afficher dans la barre latérale ».

Dans ce terminal :

```bash
cd /config
git clone https://github.com/celestin-rumo/casa-domotique.git
ln -s casa-domotique/homeassistant casa
ln -s casa/custom_sentences custom_sentences
cp casa-domotique/dev/configuration.yaml configuration.yaml
```

Ces quatre lignes reproduisent la disposition du portable : le dépôt d'un
côté, `casa/` qui pointe dessus, `custom_sentences/` là où Home Assistant
le cherche, et la configuration de dev — donc les fausses ampoules, qui
sont tout l'intérêt de cette étape.

Mettre à jour plus tard, c'est `git -C /config/casa-domotique pull` puis un
redémarrage de Home Assistant.

> **À confirmer sur le Pi.** Les deux liens symboliques sont la partie de ce
> guide qui n'a pas été exécutée. Si Home Assistant ne voit pas les phrases
> vocales, remplacez le lien `custom_sentences` par une copie
> (`cp -r casa/custom_sentences custom_sentences`), à refaire après chaque
> `git pull`. Notez ici ce que vous avez trouvé.

Puis Outils de développement → **YAML** → Vérifier la configuration, et
redémarrer. Refaire **1.2**, les logs, depuis le terminal du module :

```bash
grep -E "ERROR|Invalid config" /config/home-assistant.log | grep -v music_assistant
```

## 2.3 Les modules complémentaires

Tout ce que le portable lance en conteneur, sauf l'app, existe en module.
Boutique, installer, démarrer. Dans l'ordre :

| Module | À quoi il sert | Réglage |
|---|---|---|
| **Music Assistant** | le son | fournisseur Filesystem, dossier `/media` |
| **Speech-to-Phrase** | la reconnaissance | rien, il lit `custom_sentences/` seul |
| **Piper** | la voix | voix `fr_FR-siwis-medium` |
| **openWakeWord** | le mot d'appel | inutile avec un Voice PE |

Ils sont découverts par Home Assistant tout seuls : une notification propose
de créer l'intégration, il n'y a ni hôte ni port à taper. C'est la
différence la plus visible avec la voie Docker de l'étape 1.

Puis, comme en **1.9**, Paramètres → **Assistants vocaux** → Ajouter :
français, reconnaissance Speech-to-Phrase, synthèse Piper. Et comme en
**1.6**, le lecteur intégré de Music Assistant renommé
`media_player.ma_salon`.

Pour le fichier de test du dépôt, le dossier `/media` de Home Assistant OS
est partagé avec les modules : y déposer `signal-de-test.wav` par le module
Samba, ou par le terminal :

```bash
cp /config/casa-domotique/dev/music/signal-de-test.wav /media/
```

## 2.4 Le jeton et les vérifications

Profil → Sécurité → Jetons d'accès de longue durée, comme en **1.3**. Puis,
depuis le poste de dev, dans `app/.env` : `VITE_HA_URL` à l'adresse du Pi
telle que le natel la voit, et ce jeton. Enfin :

```bash
python3 dev/verifier.py
```

Il rejoue toute l'étape 1 contre le Pi : les entités, les playlists, les
ambiances qui allument vraiment les fausses ampoules, l'ajout à chaud, les
phrases vocales. S'il sort 0, le Pi vaut le portable.

## 2.5 Le CORS ne vous concerne pas

Une version précédente de ce document demandait ici d'ajouter l'URL réseau du
poste de dev dans `cors_allowed_origins`. C'était inutile, et le bloc `http:`
a été retiré des deux `configuration.yaml`. Deux raisons, vérifiées :

- **L'app ne fait aucune requête HTTP vers Home Assistant.** `src/ha.ts` ne
  parle que par WebSocket, et un navigateur n'applique pas le CORS aux
  WebSockets. `createLongLivedTokenAuth` ne déclenche pas d'appel REST : le
  jeton part dans le message d'authentification. Home Assistant, de son côté,
  ne vérifie pas l'origine sur `/api/websocket`.
- **`http:` en YAML est déprécié** depuis HA 2026.x, retiré en 2027.2. Pire
  qu'inutile : le bloc est importé une fois dans `.storage/` *à l'essai*, et
  sans confirmation dans l'interface sous cinq minutes, Home Assistant revient
  à sa configuration précédente **et redémarre**. On tombe donc sur un
  redémarrage inexpliqué au milieu de la première prise en main, puis le YAML
  est ignoré pour toujours, en silence.

Si un jour l'app fait de vrais appels REST, le réglage est dans l'interface :
Paramètres → Système → Réseau.

Le vrai piège de cette étape est ailleurs : l'URL que `npm run dev` affiche
doit être l'**URL réseau**, pas `localhost` — sur le natel, `localhost`
désigne le natel.

## 2.6 L'app, servie par Home Assistant

Avant de sortir Xcode : l'app est une PWA, et **Home Assistant sait servir
des fichiers**. Tout ce qu'on dépose dans `/config/www` est publié sous
`/local`. Pas de conteneur, pas de second port, pas de second nom à retenir.

Construire sur le poste de dev, avec dans `app/.env` l'adresse du Pi
**telle que le natel la voit**, sans port puisque c'est le 80
(`VITE_HA_URL=http://192.168.1.142`, pas `localhost` et pas `:8123`) :

```bash
cd app && npm run build
```

Puis déposer le résultat sur le Pi, au choix par le module **Samba** en
glissant le dossier, ou par le terminal du module SSH :

```bash
# depuis le poste de dev
scp -r app/dist/* root@homeassistant.local:/config/www/casa/
```

L'app est alors sur **`http://IP-du-Pi/local/casa/index.html`**. Sur le
natel : ouvrir cette adresse, puis **Partager → Sur l'écran d'accueil**
(iOS) ou **⋮ → Ajouter à l'écran d'accueil** (Android). Plein écran, icône,
pas de barre d'adresse. Changer quelque chose, c'est refaire ces deux
commandes ; le natel recharge, rien à réinstaller.

`vite.config.ts` porte `base: "./"` pour cela : servie sous `/local/casa/`
et non à la racine, une app aux chemins absolus se chargerait sur une page
noire, ses scripts cherchés au mauvais endroit.

Ce que ça ne fait pas : l'haptique et la barre d'état (`native.ts` les saute
hors Capacitor), et le cache hors-ligne — le service worker exige HTTPS, or
le Pi est en HTTP. Sans le Pi, la page ne s'ouvre pas ; avec lui, c'est
l'app.

Sauf sur `localhost`, que le navigateur tient pour sûr : là, le service
worker **s'enregistre** et sert l'app depuis son cache. Après une
reconstruction, le premier chargement montre encore l'ancienne version — la
nouvelle est récupérée derrière et arrive au chargement suivant. Si un
changement semble ne pas être pris : recharger une seconde fois, ou tester
depuis un autre appareil, où il n'y a pas de service worker.

**Le jeton est dans les fichiers servis, en clair, et `/local` ne demande
aucune authentification** : quiconque ouvre cette adresse sur le Wi-Fi
pilote la maison. C'est le même jeton que dans l'`.apk`, mais ici il suffit
d'une adresse. Ne jamais exposer Home Assistant hors du réseau local sans
passer par Nabu Casa ou un VPN.

## 2.7 L'app native

```bash
cd app
# .env : VITE_HA_URL=http://homeassistant.local (ou l'IP), sans port
npx cap add ios        # ou android
npm run cap:ios        # ou cap:android
```

Deux choses que cette étape teste et qu'aucune autre ne teste :

- **Le HTTP en clair.** Le Pi n'est pas en HTTPS. `capacitor.config.ts` porte
  déjà `cleartext: true` et `androidScheme: "http"` — c'est ici qu'on le vérifie.
- **Le jeton dans le build.** Il est embarqué par `import.meta.env` : si
  l'app native se connecte, c'est que le `.env` a bien été lu au moment du
  build. Changer de jeton impose de reconstruire.

## 2.8 Le routeur qui tombe

Rien dans cette installation ne passe par internet, sauf Spotify et
MétéoSuisse : internet coupé, tout marche. Ce qui coupe tout, c'est le
**routeur**, parce que le natel ne parle au Pi qu'en IP, sur le Wi-Fi. Le
natel n'a pas de radio Zigbee ; le protocole des ampoules ne lui est d'aucune
aide.

**Home Assistant OS ne peut pas servir de point d'accès.** C'est un système
fermé : pas de `nmcli`, pas de hostapd, pas de paquet à installer. Sa seule
bascule Wi-Fi est celle du premier démarrage, pour se faire configurer quand
il ne trouve aucun réseau, et elle ne convient pas comme secours permanent.

Trois parades, de la plus simple à la plus lourde :

1. **Un vieux routeur ou un routeur de voyage** en point d'accès, sur le même
   câble que le Pi. Vingt à trente francs, et il tient même pendant que le Pi
   redémarre — ce qu'un point d'accès porté par le Pi ne ferait pas.
2. **Les ampoules Hue en Bluetooth**, depuis l'app Hue : allumer et régler,
   une ampoule à la fois. Aucune ambiance, aucune musique. Le vrai filet de
   sécurité, celui qui ne demande rien à personne.
3. **Repasser à Raspberry Pi OS et Docker**, où le Pi câblé en Ethernet peut
   tenir un point d'accès permanent avec `nmcli device wifi hotspot`. Le
   dépôt garde `docker-compose.pi.yml` pour ce cas. C'est le seul argument
   sérieux contre Home Assistant OS, et il se paie en mises à jour et en
   sauvegardes à faire soi-même.

Non vérifié à ce jour : aucune des trois.

## Ce que l'étape 2 ne peut pas prouver

Rien de ce qui touche à une ampoule, une enceinte, une TV ou le bouton mural.

---

# Étape 3 — tout est réel

On remplace les faux par les vrais, un domaine à la fois. Ne pas tout brancher
d'un coup : chaque sous-étape a ses propres pannes.

## 3.1 Passer à la vraie configuration

Une seule ligne à changer, dans le terminal du module SSH :

```bash
cp /config/casa-domotique/pi/configuration.yaml /config/configuration.yaml
```

`pi/configuration.yaml` est le jumeau de celui de dev, sans les fausses
entités : plus de fausse ampoule, plus de faux capteur. `light.salon` devra
être une vraie Hue pour exister, et `sensor.temperature_interieure` un vrai
Sonoff.

Vérifier la configuration dans Outils de développement → YAML, puis
redémarrer. Le compte, le jeton, les modules et les intégrations de l'étape
2 sont conservés : on ne change que ce fichier.

**La clé Zigbee**, elle, se branche simplement sur un port USB du Pi. Home
Assistant OS la voit sans qu'on déclare son chemin, et l'intégration ZHA la
propose dans une liste. C'est la simplification la plus nette par rapport à
la voie Docker, où il fallait lui passer le périphérique à la main.

C'est aussi ici que l'automatisation du bouton mural revient : elle est
volontairement exclue du fichier de dev, parce que Home Assistant refuse de
charger un trigger dont le `device_id` n'existe pas. Tant que 3.4 n'est pas
fait, elle apparaît dans les logs, en une ligne claire :

```
Automation with alias 'Bouton mural → Cinéma' failed to setup triggers
and has been disabled: Unknown device 'REMPLACER_PAR_ID_DU_BOUTON'
```

Celle du réveil, elle, vient de `packages/reveil.yaml` et tourne depuis
l'étape 1.

Deux dossiers ont une place imposée : `packages/` est nommé par la clé
`packages:` de `configuration.yaml`, et `custom_sentences/` doit être
**directement sous `/config`** — ce sont les deux liens symboliques de 2.2.

## 3.2 Les lumières

Clé Zigbee branchée, intégration **ZHA**, appairage des 5 ampoules Hue.

Puis la seule chose qui compte : **leurs `entity_id` doivent être
`light.salon`, `light.cuisine`, `light.chambre`**. Paramètres → Entités →
renommer. Le dépôt n'a alors rien à changer.

Même chose pour le capteur de température et d'humidité, un **Sonoff
SNZB-02P**, appairé en Zigbee comme les ampoules (appui long sur son bouton
jusqu'au clignotement, pendant que ZHA cherche). ZHA crée deux entités,
`sensor.<nom>_temperature` et `sensor.<nom>_humidity` : elles deviennent
`sensor.temperature_interieure` et `sensor.humidite_interieure`, et la carte
Climat de l'écran Pièces les affiche sans rien changer. Le capteur ne parle
que quand la mesure bouge, et au plus toutes les quelques minutes : une
valeur qui ne change pas d'un coup n'est pas une panne. En dev, ce sont deux `input_number` de
`dev/configuration.yaml` : bougez-les dans l'interface, la carte suit.

```bash
curl -s -H "$H" http://homeassistant.local/api/states/light.salon
```

Puis déclencher `script.mood_detente` et **regarder la pièce**, pas l'écran.

## 3.3 Le son

Sonos et TV LG découverts par leurs intégrations. Music Assistant reçoit un
fournisseur **Spotify** au lieu du dossier local. Les lecteurs Music Assistant
sont renommés `media_player.ma_salon`, `ma_cuisine`, `ma_chambre` — les mêmes
noms qu'à l'étape 1.6, pour les mêmes raisons.

Les URI Spotify de `script.play_playlist` résolvent enfin. Chaque nom de
`input_selects.yaml` doit avoir son URI dans la table : décommentez-les au fur
et à mesure, jamais avant.

Vérifier la différence qui ne se voit qu'ici : **Détente porte
`radio_mode: true`**, donc la lecture part ailleurs après quelques titres.
Chillos ne l'a pas, donc sa playlist se joue telle quelle. Si les deux se
comportent pareil, le paramètre n'est pas passé.

## 3.4 Le bouton mural

Paramètres → Appareils → le bouton ZHA → copier son identifiant, et remplacer
`REMPLACER_PAR_ID_DU_BOUTON` dans `homeassistant/automations.yaml`.

## 3.5 La voix dans la chambre

Les modules de voix et l'assistant sont déjà en place depuis 2.3 : il ne
reste que le satellite.

Un **Home Assistant Voice Preview Edition** ou un ESP32-S3 sous ESPHome.
Le brancher sur le même réseau : il est découvert tout seul, et Home
Assistant propose de l'ajouter. Dans sa page, choisir l'assistant vocal
créé en 2.3. Le mot d'appel se détecte dans l'appareil pour un Voice PE,
sinon par le module openWakeWord.

Puis, dans la chambre, à voix haute : « réveille-moi à sept heures »,
« active le réveil », « quel temps fait-il aujourd'hui », et le lendemain
« je suis debout ». C'est la seule étape qui prouve la reconnaissance et la
synthèse elles-mêmes : jusqu'ici, l'API de conversation les contournait.

## 3.6 Le réveil pour de vrai

Le NPA de `input_text.meteo_npa`, une fois. Puis un réveil dans cinq minutes
depuis l'app, avec la Hue de la chambre et `media_player.ma_chambre` : la
lampe doit monter **sans saut visible** — chaque marche demande une
transition de trente secondes à l'ampoule, ce que les fausses ampoules ne
montrent pas — et la musique entrer à mi-chemin, à peine audible.

## 3.7 La recette d'acceptation

Dans cet ordre, en regardant l'appartement :

1. Chaque ambiance : lumières **et** son, dans les bonnes pièces.
2. Le bouton mural déclenche Cinéma.
3. Une pièce s'allume et se règle depuis l'app, y compris la couleur.
4. Une playlist se choisit depuis l'app et joue dans les bonnes pièces.
5. Le natel est débranché du Wi-Fi : l'app doit **dire** qu'elle a perdu le Pi,
   pas faire semblant de marcher.
6. Un réveil réglé depuis le natel lève la chambre et la musique à l'heure
   dite ; « je suis debout » coupe les deux.
7. La météo du jour, demandée à voix haute, revient en français avec les
   températures du jour.

---

## Repartir de zéro

```bash
docker compose -f docker-compose.dev.yml down -v
```

`-v` supprime le volume, donc le compte, le jeton et l'historique.

---

## Ce qui a réellement été exécuté

L'étape 1 a été jouée de bout en bout le 7 septembre 2026, sur Home Assistant
2026.9.1. Vérifiés pour de vrai : les logs propres (1.2), les quatre appels
`curl` de 1.4, les ambiances qui donnent aux trois lumières exactement les
états de `scenes.yaml`, la connexion WebSocket de l'app avec un jeton longue
durée, les trois playlists reçues, et l'ajout à chaud de 1.7.

Le premier démarrage a fait tomber trois choses, toutes corrigées depuis :

1. **`light: - platform: template` n'est plus accepté.** Les trois fausses
   ampoules n'existaient pas — exactement la panne silencieuse que l'étape 1.2
   sert à attraper, et la démonstration qu'elle mérite d'exister.
2. **Le bloc `http:`** déclenchait un redémarrage inexpliqué cinq minutes
   après le premier boot (voir 2.2). Retiré.
3. **`set_level` n'allumait pas la lampe.** Quand `light.turn_on` reçoit une
   luminosité, Home Assistant exécute `set_level` *à la place* de `turn_on`,
   jamais les deux : le niveau montait, l'ampoule restait éteinte. Comme toutes
   les scènes précisent une luminosité, aucune ambiance n'allumait rien. Les
   `set_level` de `dev/configuration.yaml` rallument donc aussi le booléen.

Le 8 septembre 2026, sur la même version : le réveil et la voix. Vérifiés
pour de vrai : les trois conteneurs Wyoming démarrés et leurs modèles
téléchargés, `hass --script check_config` propre avec les deux packages, les
sept entités du réveil et `sensor.meteosuisse` présentes, un lever d'une
minute qui monte `light.chambre` à 100 puis 200 et rend `script.reveil` à
`off`, et par l'API de conversation : « règle le réveil à sept heures
trente » → 07:30, « réveille-moi à 6 heures », « active », « désactive »,
et la météo du jour lue depuis MétéoSuisse.

Le même jour, la reconnaissance elle-même, par `dev/ecouter.py` : piper
prononce, les deux moteurs écoutent. Sur le portable, Speech-to-Phrase rend
les quatre phrases du dépôt en 0,25 à 0,55 s, mot pour mot ; whisper
`small-int8` en 1,5 à 1,8 s une fois chaud (5 à 10 s au premier passage, le
modèle se charge), en écrivant « 7h30 » pour « sept heures trente ».

Non vérifiés à ce jour : la partie son (1.6, qui demande les quatre étapes
manuelles de Music Assistant), la chaîne complète micro → réponse dans
Home Assistant (il faut l'assistant de 1.9, puis un micro ou un satellite),
et les étapes 2 et 3 dans leur entier.

**L'étape 2 mérite un mot.** Tout ce qui y touche à Home Assistant OS a été
écrit sans Home Assistant OS sous la main : le poste de dev fait tourner la
pile Docker, et rien d'autre. Les noms des modules complémentaires, le
comportement des liens symboliques de 2.2 et la découverte automatique de
2.3 sont ce que la documentation de Home Assistant annonce, pas ce qui a été
constaté ici. Corrigez ce fichier au fur et à mesure : c'est exactement ce
qu'ont fait les trois pannes du premier démarrage de l'étape 1.
