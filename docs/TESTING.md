# Tester, en trois étapes

Chaque étape ajoute une source de panne et une seule. C'est tout l'intérêt de
les séparer : quand quelque chose casse à l'étape 2, on sait que ce n'est ni le
YAML ni l'app, puisque l'étape 1 les a déjà prouvés.

| | Machine | Lumières | Son | Ce que l'étape prouve |
|---|---|---|---|---|
| **1** | Portable | fausses | fichier local | Le YAML, les scripts, l'app, le mécanisme des playlists |
| **2** | Raspberry Pi | fausses | fichier local | Le Pi, le réseau, l'app native sur le natel |
| **3** | Raspberry Pi | Hue · Zigbee | WiiM · Spotify | Le matériel, et lui seul |

## Une seule pièce, la chambre

**Le dépôt ne connaît qu'une pièce.** Deux lumières Hue — la lampe
`light.chambre` et le bandeau `light.chambre_bandeau`. Une enceinte,
`media_player.ma_chambre`. Cinq ambiances qui ne pilotent qu'elles : Détente,
Focus, Chillos, Câlin et Tout éteindre.

Les deux lumières ne font jamais la même chose, et c'est délibéré : la lampe
éclaire, le bandeau colore. Câlin met le rouge rosé au bandeau et laisse la
lampe chaude et basse ; Focus allume la lampe et éteint le bandeau. Les donner
à la même couleur reviendrait à n'en avoir qu'une.

C'est le matériel réellement installé au 10 septembre 2026 — une WiiM Sound
Lite dans la chambre — et le dépôt est écrit comme s'il n'y avait rien
d'autre, plutôt que de viser une maison qui n'existe pas encore. Un script qui
cherche une enceinte absente échoue en silence : mieux vaut qu'il ne la
cherche pas.

**Ce qui viendra plus tard**, quand le matériel sera là :

| | Ce que ça rendra |
|---|---|
| Les autres pièces | le salon et la cuisine, leurs ampoules, leurs enceintes, et le groupement multiroom (`media_player.join`) que les ambiances faisaient |
| La TV | l'ambiance **Cinéma**, `scene.cinema` et la barre de son |
| Plex sur le Synology | l'étape 3.6 en entier, et `packages/cinema.yaml` |

Rien de tout ça n'est perdu : la version multi-pièces avec TV est dans
l'historique git, **commit `ccb9f08` et avant**. `git show ccb9f08:homeassistant/scripts.yaml`
la ressort telle quelle.

Le reste de ce guide parle encore, ici ou là, d'une maison à plusieurs
pièces — c'est la maison visée, pas celle d'aujourd'hui. Les commandes et les
`entity_id` qu'il donne, eux, sont ceux de la chambre.

---

# Étape 1 — tout est faux

Aucun Raspberry Pi, aucune ampoule, aucune enceinte. Deux conteneurs sur le
poste de dev. `dev/configuration.yaml` inclut les fichiers du dépôt et déclare
deux *template lights* adossées à des `input_boolean` : `light.chambre` et
`light.chambre_bandeau` existent sans qu'aucune ampoule soit branchée.

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
curl -s -H "$H" http://localhost:8123/api/states/light.chambre
# → {"entity_id":"light.chambre","state":"off", ...}

# la liste des playlists, telle que l'app la lira
curl -s -H "$H" http://localhost:8123/api/states/input_select.playlist
# → "attributes":{"options":["Détente"], ...}

# les scripts sont enregistrés
curl -s -H "$H" http://localhost:8123/api/states/script.play_playlist

# une ambiance change vraiment l'état des lumières
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"entity_id":"script.mood_detente"}' \
  http://localhost:8123/api/services/script/turn_on
curl -s -H "$H" http://localhost:8123/api/states/light.chambre
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

Attendu : les cinq ambiances, la lumière de la chambre qui réagit pour de
vrai, et **trois playlists dans la liste** — Détente, Chillos et Focus. Un nom
n'apparaît que si son URI est dans la table de `script.play_playlist` : une
entrée sans adresse serait un bouton qui ne joue rien.

Un appui sur une ambiance l'allume tout de suite, contour qui respire, jusqu'à
l'écho de `input_select.mood`. Sans Music Assistant, **Détente, Focus, Chillos
et Câlin reviennent en arrière après six secondes** avec une ligne qui nomme
le script — leur son a échoué avant l'écho, c'est l'état réel. Seul Tout
éteindre se confirme. Si un bouton restait allumé sans écho, ce serait le
défaut, pas l'inverse.

Quatre onglets. **Pièces** : chaque lumière a son interrupteur et son
intensité ; « Avancé » n'apparaît que si l'ampoule sait faire du blanc réglable
ou de la couleur — les fausses ampoules ne savent que l'intensité, donc pas
d'« Avancé » avant l'étape 3. **Écoute** dit « Enceinte absente » avec
`media_player.ma_chambre` en toutes lettres tant que 1.6 n'est pas fait.
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
`media_player.ma_chambre`.

À partir de là `scripts.yaml`, `config.ts` et les ambiances marchent **sans
être modifiés**. L'alternative — éditer le dépôt pour viser le nom automatique
du lecteur — finit toujours par être committée par erreur et à casser la prod.

**e.** Les URI de `script.play_playlist` sont des playlists Spotify : sans
compte, aucune ne résout. Pour un essai local, trouvez d'abord un `media_id`
que Music Assistant accepte — Outils de développement → Actions →
`music_assistant.play_media`, cible `media_player.ma_chambre`. Puis ajoutez-le à
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
chacune avec son URI, les cinq ambiances comparées à `scenes.yaml`, l'ajout à
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

Pour entendre la moitié son en dev, où seule `media_player.ma_chambre` existe
(1.6) : Outils de développement → Actions → `script.reveil`, avec
`player: media_player.ma_chambre` et `duree: 1`. La musique entre à trente
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

**Le module officiel n'a pas `git`.** Il s'installe par les options du
module, onglet Configuration, dans le champ `apks` :

```yaml
authorized_keys: []
password: 'un-mot-de-passe-à-toi'
apks:
  - git
server:
  tcp_forwarding: false
```

Enregistrer, puis redémarrer le module depuis son onglet Info. Deux pièges :
sans mot de passe **ni** clé publique, le module refuse de démarrer, et on
cherche un terminal qui ne s'ouvrira pas ; et un `apk add git` tapé à la main
disparaît au redémarrage suivant, parce que le conteneur du module est
recréé à chaque fois — `apks` est rejoué, lui. Le module doit donc avoir
internet au démarrage. La version communautaire **Advanced SSH & Web
Terminal** livre `git` d'origine et n'a pas besoin de ce réglage.

Dans ce terminal :

```bash
cd /config
git clone https://github.com/celestin-rumo/casa-domotique.git
ln -s casa-domotique/homeassistant casa
ln -s casa/custom_sentences custom_sentences
cp casa-domotique/dev/configuration.yaml configuration.yaml
cp casa/scenes.yaml scenes.yaml
```

Ces cinq lignes reproduisent la disposition du portable : le dépôt d'un
côté, `casa/` qui pointe dessus, `custom_sentences/` là où Home Assistant
le cherche, et la configuration de dev — donc les fausses ampoules, qui
sont tout l'intérêt de cette étape.

**La cinquième ligne est d'une autre nature, et c'est une copie, pas un
lien.** Les scènes sont les seules à ne pas être chargées depuis le dépôt :
`configuration.yaml` déclare `scene: !include scenes.yaml`, sans préfixe,
donc le fichier de Home Assistant lui-même. C'est ce qui rend l'éditeur de
l'interface utilisable — il ne sait écrire que dans un fichier qu'il possède,
et il refuse tout net ce qui vient d'ailleurs.

Le partage est délibéré : les scènes sont du goût, on les retouche à l'œil
dans la pièce, et un aller-retour par `git commit` et `git pull` à chaque
essai n'aurait aucun sens. Les scripts, eux, restent au dépôt : ils portent
la logique, et l'éditeur de l'interface détruirait au passage l'ancre YAML
que les ambiances se partagent.

Conséquence à connaître : une fois copiées, **les scènes ne suivent plus le
dépôt**. Un `git pull` n'y touche pas. Pour figer une ambiance qui te
satisfait durablement, recopie-la en sens inverse et committe-la — en
sachant que l'éditeur aura effacé les commentaires en réécrivant le fichier.

Deux pièges de chemin, tous les deux constatés sur le Pi le 10 septembre
2026. **Le clone doit atterrir dans `/config`**, pas dans le `~` où le
terminal s'ouvre : le module SSH et Home Assistant sont deux conteneurs
séparés, qui ne partagent que les dossiers montés. Ce qui est dans `/root`
est invisible pour Home Assistant, et recréé à chaque redémarrage du module.
Le dossier personnel du terminal affiche d'ailleurs `config` et
`homeassistant` côte à côte : ce sont **deux chemins vers le même dossier**,
au choix. Et **les liens symboliques doivent rester relatifs**, comme
ci-dessus, sans `/` initial — Home Assistant voit ce dossier sous `/config`
dans son propre conteneur, et un lien absolu écrit depuis le terminal
pointerait vers un chemin qui n'existe pas chez lui.

L'avant-dernière ligne **écrase** le `configuration.yaml` livré par Home
Assistant. Il n'y a rien à y perdre sur une installation neuve, mais celui
d'origine lit `automations.yaml` et `scripts.yaml` à la racine de `/config` —
ceux que l'interface écrit quand on crée un script en cliquant — là où celui
du dépôt redirige ces `!include` vers `casa/`. Les fichiers ne sont pas
supprimés, ils cessent d'être chargés : ce qui avait été créé à la souris
disparaît de la liste. D'où, si l'installation a déjà servi,
`cp configuration.yaml configuration.yaml.avant-casa` avant. Les **scènes**
font exception et restent lues à la racine, d'où la copie qui suit.

Mettre à jour plus tard, c'est `git -C /config/casa-domotique pull` puis un
redémarrage de Home Assistant.

> Ce clone en `https://` ne demande rien parce que **le dépôt est public**.
> Sur un dépôt privé, GitHub réclame un identifiant et refuse le mot de passe
> du compte, qui n'est plus accepté depuis 2021. Il faudrait alors une **clé
> de déploiement** — une clé SSH en lecture seule, liée à ce seul dépôt —
> rangée dans `/config/.ssh` et déclarée par
> `git -C /config/casa-domotique config core.sshCommand "ssh -i /config/.ssh/id_ed25519"`,
> car `/root/.ssh` est recréé à chaque redémarrage du module.

Vérifier que les liens ne pointent pas dans le vide, avant de redémarrer :

```bash
ls /config/casa/ /config/custom_sentences/fr/
```

Le second chemin est le vrai test, parce qu'il traverse **deux** liens l'un
après l'autre. S'il liste `ambiances.yaml`, `meteo.yaml` et `reveil.yaml`,
c'est bon — constaté sur le Pi le 10 septembre 2026. S'il répond `No such
file or directory`, remplacer le lien `custom_sentences` par une copie
(`rm /config/custom_sentences && cp -r /config/casa/custom_sentences /config/custom_sentences`),
à refaire après chaque `git pull`.

> **Reste à confirmer** : que Home Assistant *lise* effectivement ces phrases
> à travers les liens, ce que seul un essai à la voix après redémarrage dit
> (étape 3.4). Les liens résolvent dans le terminal ; c'est nécessaire, pas
> encore suffisant.

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

> **Et il ne faut surtout pas en taper.** Constaté sur le Pi le 10 septembre
> 2026, une heure de perdue : si l'intégration Music Assistant est créée à la
> main avec une adresse — `http://mass.local:8095`, l'IP du Pi, peu importe —
> elle échoue au démarrage sur
>
> ```
> InvalidToken: Home Assistant system user not allowed on regular webserver
> ConfigEntryError: Authentication failed, addon discovery not completed yet
> ```
>
> Aucune entité n'est alors créée, et les scripts échouent sur un
> `Referenced entities media_player.ma_chambre are missing` — sans que rien
> ne rattache ce symptôme à sa cause. On peut même entendre de la musique
> pendant ce temps, lancée depuis un natel, et croire que Home Assistant
> pilote quelque chose.
>
> La raison : un module doit se relier par la **découverte du superviseur**,
> qui porte les bonnes informations d'authentification. Par une adresse
> ordinaire, Home Assistant se présente comme un utilisateur système, et
> Music Assistant refuse. L'IP de **1.6** vaut pour la pile Docker, où il n'y
> a pas de superviseur — pas ici.
>
> Si c'est arrivé : supprimer l'intégration, **redémarrer le module**
> (Paramètres → Modules complémentaires → Music Assistant → Redémarrer),
> c'est au démarrage qu'il s'annonce. La carte « découvert » apparaît alors
> seule, et **Configurer** ne demande aucune adresse. C'est à ça qu'on sait
> qu'on a pris le bon chemin.

Puis, comme en **1.9**, Paramètres → **Assistants vocaux** → Ajouter :
français, reconnaissance Speech-to-Phrase, synthèse Piper. Et comme en
**1.6**, le lecteur intégré de Music Assistant renommé
`media_player.ma_chambre`.

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

## 2.5 Le CORS, pour une seule requête

Une version précédente de ce document demandait ici d'ajouter l'URL réseau du
poste de dev dans `cors_allowed_origins`, par un bloc `http:`. Le bloc a été
retiré des deux `configuration.yaml`, et il ne doit pas revenir :

- **`http:` en YAML est déprécié** depuis HA 2026.x, retiré en 2027.2. Pire
  qu'inutile : le bloc est importé une fois dans `.storage/` *à l'essai*, et
  sans confirmation dans l'interface sous cinq minutes, Home Assistant revient
  à sa configuration précédente **et redémarre**. On tombe donc sur un
  redémarrage inexpliqué au milieu de la première prise en main, puis le YAML
  est ignoré pour toujours, en silence.

**Presque tout ce que fait l'app échappe au CORS.** `src/ha.ts` parle par
WebSocket, et un navigateur n'applique pas le CORS aux WebSockets.
`createLongLivedTokenAuth` ne déclenche pas d'appel REST : le jeton part dans
le message d'authentification. Home Assistant, de son côté, ne vérifie pas
l'origine sur `/api/websocket`.

**Une requête fait exception : enregistrer une ambiance.** Ambiances →
Ajuster → « Enregistrer les lumières » fige l'état actuel des lampes dans une
scène, et Home Assistant n'expose pas l'écriture des scènes par WebSocket —
son propre éditeur passe par `POST /api/config/scene/config/<id>`. C'est la
seule requête HTTP de toute l'app, et le CORS s'y applique.

Ce que ça change, selon d'où l'app est servie :

| L'app tourne sur | Origine | À régler |
|---|---|---|
| Home Assistant, `/local/casa/` (2.6) | la même que Home Assistant | rien |
| `npm run dev`, le poste de dev | une autre | déclarer l'origine dans **Paramètres → Système → Réseau** |

Sans ce réglage, en dev, le bouton répond « origine refusée » et tout le
reste de l'app marche normalement. Le chemin normal sur le natel, l'app
servie par Home Assistant, n'est pas concerné.

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

Puis déposer le résultat sur le Pi. Trois chemins, et les deux évidents
demandent quelque chose qu'une installation neuve n'a pas :

- **`scp`** exige le serveur SSH du module Terminal & SSH, sur le port 22.
  Or le module officiel, tel qu'installé en 2.2, n'ouvre que le terminal
  web : le port 22 reste fermé tant qu'on ne l'active pas dans ses options
  réseau.
- **Samba** exige son propre module (Boutique → Samba share), après quoi le
  partage `config` s'ouvre dans le gestionnaire de fichiers et on glisse le
  contenu de `app/dist/` dans `www/casa/`.
- **Le Pi va chercher les fichiers**, sans rien installer. C'est ce qui a
  servi le 11 septembre 2026. Sur le poste de dev, une archive servie le
  temps du transfert, et le port ouvert au seul Pi — le pare-feu refuse
  tout ce qui arrive par défaut :

  ```bash
  mkdir -p /tmp/casa-serve && tar -C app/dist -czf /tmp/casa-serve/casa.tar.gz .
  sudo ufw allow from IP-du-Pi to any port 8765 proto tcp
  timeout 900 python3 -m http.server 8765 --directory /tmp/casa-serve
  ```

  Un dossier dédié, surtout : `http.server` publie tout ce qu'il contient
  sur le réseau. Puis, dans le terminal du Pi :

  ```bash
  [ -d /config/www ] || echo "www NOUVEAU : redémarrer Home Assistant après"
  mkdir -p /config/www/casa
  curl -fsS -o /tmp/casa.tar.gz http://IP-du-poste:8765/casa.tar.gz \
    && tar -xzf /tmp/casa.tar.gz -C /config/www/casa && rm /tmp/casa.tar.gz
  ```

  Et refermer : `sudo ufw delete allow from IP-du-Pi to any port 8765 proto tcp`.

**Si `/config/www` n'existait pas avant, redémarrer Home Assistant.** Il ne
publie `/local` que si ce dossier existe *à son démarrage* ; créé après coup,
il reste invisible et la page répond 404 sans autre explication.

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

Rien de ce qui touche à une ampoule, une enceinte ou une TV.

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
entités : plus de fausse ampoule, plus de faux capteur. `light.chambre` devra
être une vraie Hue pour exister, et `sensor.temperature_interieure` un vrai
Sonoff.

Vérifier la configuration dans Outils de développement → YAML, puis
redémarrer. Le compte, le jeton, les modules et les intégrations de l'étape
2 sont conservés : on ne change que ce fichier.

> **Les fausses entités ne partent pas toutes seules, et elles gardent leurs
> noms réservés.** Constaté sur le Pi le 10 septembre 2026, et c'est une heure
> perdue si on ne le sait pas.
>
> Les entités de `dev/configuration.yaml` ont un `unique_id`
> (`casa_dev_chambre`, `casa_dev_salon`…). Home Assistant les inscrit donc à
> son **registre**, ce qui est normalement utile : c'est ce qui permet de
> renommer une entité sans que ça saute au redémarrage. Mais retirer le YAML
> ne retire pas la fiche. Elle survit, elle continue d'occuper
> `light.chambre`, et le renommage de la vraie ampoule Hue échoue sur
> *« Entity with this ID is already registered »* — ou pire, réussit en
> silence sous le nom `light.chambre_1`, que le dépôt ne pilotera jamais.
>
> Le piège, c'est qu'on ne les trouve pas. Une entité dont la configuration a
> disparu n'est ni « indisponible » ni « désactivée » : elle est **« non
> fournie »**, un statut qu'aucun filtre n'affiche par défaut.
>
> Donc, après le redémarrage et **avant de renommer quoi que ce soit** :
> Paramètres → Appareils et services → **Entités** → panneau **Filtres** →
> section **Statut** → cocher **« Non fourni »**. Effacer aussi le filtre de
> pièce, ces fiches n'appartenant à aucun appareil. Apparaissent alors
> `light.chambre`, `light.chambre_bandeau`, `sensor.temperature_interieure`,
> `sensor.humidite_interieure` — et, si le dépôt a connu plusieurs pièces,
> `light.salon` et `light.cuisine`. Tout sélectionner, **Supprimer**.
>
> Pour voir d'un coup ce que le registre contient vraiment, sans dépendre de
> l'interface :
>
> ```bash
> grep -oE '"entity_id": ?"light\.[^"]*"' /config/.storage/core.entity_registry | sort -u
> ```
>
> Les fichiers `.storage` sont du JSON compact, d'où le ` ?` du motif : un
> `grep` écrit avec l'espace ne trouve rien et laisse croire que le registre
> est vide.

**La clé Zigbee**, elle, se branche simplement sur un port USB du Pi. Home
Assistant OS la voit sans qu'on déclare son chemin, et l'intégration ZHA la
propose dans une liste. C'est la simplification la plus nette par rapport à
la voie Docker, où il fallait lui passer le périphérique à la main.

Les seules automatisations du dépôt sont celles des packages — le réveil et
la météo — et elles tournent depuis l'étape 1. Il n'y a pas
d'`automations.yaml` : le dépôt n'a pas de bouton mural, et n'en aura pas.

Deux dossiers ont une place imposée : `packages/` est nommé par la clé
`packages:` de `configuration.yaml`, et `custom_sentences/` doit être
**directement sous `/config`** — ce sont les deux liens symboliques de 2.2.

## 3.2 Les lumières

**Clé Zigbee, pont Hue, ou les deux ?** Trois faits tranchent, dans cet
ordre :

1. Le capteur **Sonoff SNZB-02P** n'est pas un appareil Hue. Un pont Hue
   refuse de l'appairer : **la clé est obligatoire** dès qu'on veut la carte
   Climat.
2. La **synchronisation de la TV** avec les lampes, elle, passe
   obligatoirement par le **pont**. Le mode Entertainment est un flux temps
   réel du pont vers les ampoules, que ni ZHA ni Home Assistant ne savent
   produire : par Zigbee ordinaire, on envoie quelques ordres par seconde, là
   où il en faut des dizaines. Une ampoule pilotée par ZHA ne peut pas être
   synchronisée.
3. Une ampoule est sur l'un **ou** sur l'autre, jamais sur les deux.

D'où la règle : **pas de sync TV, pas de pont** — tout sur la clé, un seul
réseau à comprendre. **Sync TV voulue, alors toutes les ampoules sur le
pont**, qui en accepte une cinquantaine, et la clé pour le capteur et le
bouton. Deux réseaux, à mettre sur des canaux éloignés l'un de l'autre et
du Wi-Fi.

Un effet de bord de ce partage : le réseau de la clé n'a plus que des
appareils sur pile, qui ne relaient rien. Sa portée devient celle de la clé
seule, sans le maillage que les ampoules assuraient. Si le capteur est loin,
une simple prise Zigbee sur secteur, appairée à la clé, sert de relais.

Et le pont ne synchronise rien à lui seul : il lui faut une source d'image.
Deux façons, et pour un téléviseur LG récent c'est la seconde :

- Le **boîtier HDMI Hue Play Sync Box**, entre les sources et la TV. Cher,
  et il ne voit que ce qui le traverse — pas les applications intégrées du
  téléviseur.
- L'**application Hue Sync installée sur le téléviseur**, qui synchronise
  tout ce que la TV affiche et ne demande aucun matériel. Disponible sur les
  **LG de 2024 et 2025**, dont les OLED C5 et G5. Achat unique d'environ 130
  euros, ou abonnement mensuel.

Une limite qui compte ici : cette application **exige une connexion
internet**. C'est la seule pièce de toute l'installation dans ce cas — le
reste, ambiances et voix comprises, tourne sur le réseau local (2.8).
Vérifié en septembre 2026.

Les ambiances ne dépendent pas de ce choix : elles vivent dans `scenes.yaml`
et `scripts.yaml`, du côté de Home Assistant, et pilotent `light.chambre` sans
savoir d'où vient l'entité. Rien dans le dépôt n'est lié à ZHA plutôt qu'au
pont — c'est ce qui rend le choix réversible : ré-appairer une ampoule d'un
côté à l'autre, puis la renommer `light.chambre`, et le dépôt ne s'en aperçoit
pas.

**Brancher la clé, dans l'ordre :**

1. **Une rallonge USB, toujours.** C'est le conseil qui évite la panne la
   plus fréquente et la plus insaisissable de tout le Zigbee. Un port USB 3
   et une antenne Wi-Fi rayonnent en 2,4 GHz, juste à côté de la bande
   Zigbee ; une clé plantée directement dans le Pi donne un réseau qui
   marche à trois mètres et pas à six, avec des appareils qui décrochent
   sans raison. Un mètre de rallonge USB 2.0, la clé posée à l'écart, et le
   problème n'existe pas.
2. La brancher sur un **port USB 2.0** du Pi, les noirs, en gardant les
   bleus pour le disque.
3. Redémarrer la machine : Paramètres → Système → bouton en haut à droite →
   **Redémarrer le système**. Home Assistant OS voit la clé sans qu'on lui
   déclare quoi que ce soit, contrairement à la voie Docker.
4. Au retour, Home Assistant propose en général l'intégration tout seul,
   dans une notification. Sinon : Paramètres → Appareils et services →
   Ajouter une intégration → **Zigbee Home Automation**, et choisir le port
   série proposé dans la liste.
5. Si le type de radio est demandé, il dépend du modèle de clé. Un Sonoff
   **ZBDongle-P** est un Texas Instruments, un **ZBDongle-E** un Silicon
   Labs. La détection automatique tombe juste presque toujours ; ne la
   corrigez que si elle échoue.

**Appairer**, ensuite : ZHA → Ajouter un appareil, ce qui ouvre une fenêtre
de recherche de quelques minutes. Une ampoule Hue neuve s'annonce dès sa
première mise sous tension. Une ampoule déjà appairée à un pont Hue doit
être réinitialisée avant : par l'app Hue, ou par cinq à six coupures de
courant d'affilée. Approchez le premier appareil de la clé, les suivants
profiteront des ampoules comme relais.

Puis la seule chose qui compte : **la lampe doit avoir l'`entity_id`
`light.chambre`, et le bandeau `light.chambre_bandeau`**. Paramètres →
Entités → l'entité → l'**engrenage** → champ **« ID d'entité »**, et pas
seulement le nom : changer le nom affiché ne change pas l'identifiant, et
c'est l'identifiant que le dépôt vise. Si Home Assistant répond que l'ID est
déjà pris, ce sont les fiches orphelines de 3.1 — les supprimer d'abord. Le
dépôt n'a alors rien à changer. Les ampoules des autres
pièces peuvent être appairées dès maintenant, mais rien ne les pilotera tant
que le dépôt n'a qu'une pièce.

**Le bandeau Gradient ne fera pas de dégradé sur ZHA.** Il s'affichera d'une
seule couleur, unie. Le dégradé est un flux du pont Hue vers le bandeau, que
ni ZHA ni Home Assistant ne savent produire — et même avec le pont, Home
Assistant ne peut pas *composer* un dégradé : le modèle d'entité `light` n'a
qu'une couleur. Ce qui marche dans ce cas, c'est de composer la scène dans
l'app Hue, où elle devient une entité `scene.*` que `scripts.yaml` déclenche à
la place de la scène du dépôt.

> **Un RuuviTag fait l'affaire, et évite d'acheter le Sonoff.** C'est ce qui
> a servi ici : il donne température et humidité en Bluetooth, sans Zigbee,
> et il suffit de renommer ses deux entités comme ci-dessous. La carte Climat
> ne regarde que les `entity_id`, jamais d'où vient la mesure.

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
curl -s -H "$H" http://homeassistant.local/api/states/light.chambre
```

Puis déclencher `script.mood_detente` et **regarder la pièce**, pas l'écran.

## 3.3 Le son

L'enceinte est découverte par son intégration. Music Assistant reçoit un
fournisseur **Spotify** au lieu du dossier local, et son lecteur est renommé
`media_player.ma_chambre` — le même nom qu'à l'étape 1.6, pour les mêmes
raisons.

**Le matériel réel, au 10 septembre 2026 : une seule enceinte, une WiiM
Sound Lite, dans la chambre.** Ni Sonos, ni TV, et c'est pourquoi le dépôt
n'a plus qu'une pièce.

Attention, elle apparaît en **deux entités pour un seul appareil**
(`media_player.wiim_sound_lite_932a` et `..._932a_2`), vue par deux
intégrations. C'est celle qu'expose **Music Assistant** qu'il faut renommer :
tous les scripts passent par `music_assistant.play_media`, qui ne sait viser
que ses propres lecteurs.

Ne supprimez pas l'autre pour autant. Selon la façon dont Music Assistant est
branché, c'est peut-être cette entité-là qu'il pilote en dessous : la retirer
couperait le son sans rien dire. Paramètres → Entités → la masquer suffit à
ne plus la voir.

Les URI Spotify de `script.play_playlist` résolvent enfin. Chaque nom de
`input_selects.yaml` doit avoir son URI dans la table : décommentez-les au fur
et à mesure, jamais avant.

Vérifier la différence qui ne se voit qu'ici : **Détente porte
`radio_mode: true`**, donc la lecture part ailleurs après quelques titres.
Chillos ne l'a pas, donc sa playlist se joue telle quelle. Si les deux se
comportent pareil, le paramètre n'est pas passé.

## 3.4 La voix dans la chambre

Les modules de voix et l'assistant sont déjà en place depuis 2.3 : il ne
reste que le satellite.

Un **Home Assistant Voice Preview Edition** ou un ESP32-S3 sous ESPHome.
Le brancher sur le même réseau : il est découvert tout seul, et Home
Assistant propose de l'ajouter. Dans sa page, choisir l'assistant vocal
créé en 2.3. Le mot d'appel se détecte dans l'appareil pour un Voice PE,
sinon par le module openWakeWord.

**Le mot d'appel est indépendant du reste.** Il ne décide que du moment où
l'écoute commence ; la langue de la phrase qui suit et le moteur qui la
transcrit ne le concernent pas. On dit donc « OK Nabu » puis une phrase
française, et c'est normal.

Les cinq modèles disponibles sont **tous anglophones** — vérifié le
9 septembre 2026 en interrogeant le service :

| Modèle | Ce qu'on dit |
|---|---|
| `okay_nabu` | Okay Nabu |
| `hey_jarvis` | Hey Jarvis |
| `hey_mycroft` | Hey Mycroft |
| `alexa` | Alexa |
| `hey_rhasspy` | Hey Rhasspy |

Conséquence, constatée le même jour en faisant prononcer le mot par piper et
écouter par openWakeWord : « OK Nabu » dit à la française **n'a pas
déclenché**, « okey na bou », plus proche de l'anglais, **a déclenché**. Ce
n'est pas une panne, c'est un modèle entraîné sur des voix anglaises.
Prononcez-le à l'anglaise. Sur un Voice PE la détection se fait dans
l'appareil, avec un modèle mieux réglé et de la vraie voix humaine plutôt
qu'une synthèse : c'est plus tolérant que ce test.

Puis, dans la chambre, à voix haute : « réveille-moi à sept heures »,
« active le réveil », « quel temps fait-il aujourd'hui », et le lendemain
« je suis debout ». C'est la seule étape qui prouve la reconnaissance et la
synthèse elles-mêmes : jusqu'ici, l'API de conversation les contournait.

## 3.5 Le réveil pour de vrai

Le NPA de `input_text.meteo_npa`, une fois. Puis un réveil dans cinq minutes
depuis l'app, avec la Hue de la chambre et `media_player.ma_chambre` : la
lampe doit monter **sans saut visible** — chaque marche demande une
transition de trente secondes à l'ampoule, ce que les fausses ampoules ne
montrent pas — et la musique entrer à mi-chemin, à peine audible.

## 3.6 Les films du Synology

Facultatif, et à faire en dernier : le reste de la maison n'en dépend pas.

> **En attente : il n'y a pas de téléviseur au 10 septembre 2026.** Toute
> cette étape, le `packages/cinema.yaml` qu'elle décrit, la `scene.cinema` et
> le `script.mood_cinema` reposent sur `media_player.lg_tv` et
> `media_player.plex_lg_tv`, qui n'existent pas. Les scènes et les scripts se
> chargent quand même sans erreur — c'est au déclenchement que ça échoue. À
> reprendre quand la TV sera là, et à ce moment-là vérifier si c'est bien une
> LG : `scenes.yaml` et `cinema.yaml` sont écrits pour son intégration.

Plex tourne sur le Synology, son application sur la TV, et Home Assistant
reçoit les deux intégrations. `packages/cinema.yaml` fait le reste :
`script.plex_ouvrir` allume la TV, ouvre l'application et **attend que le
client réponde** ; `script.plex_film` lui envoie ensuite un titre, en
lançant l'ambiance Cinéma au passage, sans l'attendre.

Trois valeurs à confirmer dans ce package : l'entité de la TV, celle du
client Plex, et le nom exact de l'application tel que la TV l'annonce.

**Ce que ça coûte : rien.** La lecture d'une bibliothèque personnelle **sur
le réseau local** reste gratuite chez Plex, et c'est tout ce que fait cette
installation. Ce qui est devenu payant en 2025 et 2026, c'est l'accès
**distant**, hors de la maison, par un Plex Pass côté serveur ou un Remote
Watch Pass côté spectateur. Jellyfin est l'alternative entièrement libre,
au prix d'un montage plus manuel.

L'attente est un `wait_template`, pas un `delay`. Home Assistant ne peut
envoyer un film qu'à un client déjà actif, et le temps d'ouverture d'une
application varie du simple au triple : un délai fixe est trop court le jour
où ça compte.

**Ce que la voix en fait, et pourquoi la liste des titres existe.** Vérifié
le 9 septembre 2026, en faisant prononcer la phrase par piper et écouter par
les deux moteurs :

| Moteur | Ce qu'il a entendu | Assist |
|---|---|---|
| whisper | « Lance le film d'une. » | ne comprend pas |
| speech-to-phrase | « lance le film dune » | lance le film |

Whisper a écrit « d'une » là où il fallait « Dune ». C'est tout le sujet :
un moteur libre écrit ce qu'il croit entendre, un moteur entraîné sur vos
titres écrit le vôtre. D'où `custom_sentences/fr/films.yaml`, où chaque
titre dicible est déclaré — contrainte réelle, mais qui achète une
reconnaissance juste et sous la seconde.

Sans TV branchée, l'assistant répond « La télévision ne répond pas » plutôt
que d'échouer en silence. C'est ce que le vérificateur constate en dev.

## 3.7 La recette d'acceptation

Dans cet ordre, en regardant la chambre :

1. Chaque ambiance : lumière **et** son.
2. La lampe s'allume et se règle depuis l'app, y compris la couleur.
3. Une playlist se choisit depuis l'app et joue sur l'enceinte.
4. Le natel est débranché du Wi-Fi : l'app doit **dire** qu'elle a perdu le Pi,
   pas faire semblant de marcher.
5. Un réveil réglé depuis le natel lève la chambre et la musique à l'heure
   dite ; « je suis debout » coupe les deux.
6. La météo du jour, demandée à voix haute, revient en français avec les
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

**Le 10 septembre 2026, l'étape 2.2 sur le Pi**, sous Home Assistant OS pour
de vrai. Le module Terminal & SSH n'a pas `git` : il s'installe par ses
`apks`. Le dépôt cloné dans `/config`, les deux liens symboliques posés en
relatif, et `dev/configuration.yaml` copié par-dessus celui d'origine. Après
redémarrage, `ha core logs` ne montre aucun `Invalid config`, et les États
donnent tout ce que cette étape promet : les trois `light.` template, les
deux capteurs simulés, `input_select.mood` et `input_select.playlist`, les
sept entités du réveil, `input_text.meteo_npa` — donc les deux packages et
les quatre `!include` traversent bien les liens. L'automatisation météo
s'était déjà déclenchée d'elle-même le matin même.

Quatre corrections que ce passage a imposées au guide : `git` à installer,
le clone à faire dans `/config` et non dans le `~` du terminal, les liens à
garder relatifs, et `/config/home-assistant.log` qui n'existe pas sous Home
Assistant OS — les journaux se lisent avec `ha core logs`.

**Le même jour, 3.1 et 3.2 : les lumières, pour de vrai.** Clé Zigbee,
intégration ZHA, et les deux Hue de la chambre appairées — une lampe
Essential White & Color Ambiance et un bandeau Flux Gradient. Les deux se
sont annoncées sans coupure de courant, une fois **supprimées de l'app Hue**
sur le natel : tant qu'un appareil les revendique en Bluetooth, elles ne
cherchent pas de réseau Zigbee. Le bandeau, appairé le premier, a servi de
relais pour la lampe.

`script.mood_calin` déclenché depuis Outils de développement : la lampe tombe
en blanc ambré à 20, le bandeau passe au rouge rosé. La moitié son échoue sur
`Action music_assistant.play_media introuvable`, comme prévu tant que 3.3
n'est pas fait — et le script s'arrêtant là, l'écho vers `input_select.mood`
n'a pas lieu, donc l'app revient en arrière au bout de six secondes. C'est le
comportement voulu, pas une panne.

Ce passage a coûté une heure sur un seul point, désormais documenté en 3.1 :
les entités template de dev survivent au registre et gardent leurs noms
réservés. Le renommage de la vraie lampe avait discrètement réussi sous
`light.chambre_1` — une lampe qui marche, que le dépôt ne pilote pas, et rien
pour le dire. Le tri par plateforme (`platform == "template"`) dans
`core.entity_registry` est ce qui a permis de les distinguer sans risque.

Une bonne surprise au passage : un **RuuviTag** déjà en place dans la chambre
donne température et humidité en Bluetooth. Le Sonoff SNZB-02P de 3.2 n'est
donc pas nécessaire — ses deux entités sont renommées
`sensor.temperature_interieure` et `sensor.humidite_interieure` et la carte
Climat les prend telles quelles.

**Et le son, dans la foulée : 3.3 passée.** Module Music Assistant installé,
fournisseur **Spotify** en librespot, fournisseur de lecteurs **WiiM /
LinkPlay** — natif, meilleur qu'AirPlay ou Chromecast pour cette enceinte.
Le lecteur renommé `media_player.ma_chambre`, et `script.mood_calin` va
désormais jusqu'au bout : lampes, playlist, volume, et l'écho vers
`input_select.mood` qui confirme que rien n'a échoué en route.

L'heure perdue, ici, tient à l'intégration créée à la main avec une adresse
au lieu d'être découverte — l'encadré de 2.3 raconte le symptôme et le
remède.

**Le 11 septembre 2026, 2.6 : la page servie par le Pi.** Construite avec
`VITE_HA_URL=http://192.168.1.142`, sans port. Le Pi n'avait ni port 22 ni
Samba : il est allé chercher l'archive sur le poste de dev, comme décrit en
2.6. `/local/casa/index.html` et chacun des fichiers qu'il charge répondent
200, donc le `base: "./"` de `vite.config.ts` tient sous `/local/casa/`.
Ouverte dans un vrai navigateur, l'app se connecte : « 2 allumées sur 2 »,
l'ambiance Détente en cours, aucune erreur dans la console.

Un piège pour qui vérifie avec un navigateur automatisé : **Chrome headless
avec `--virtual-time-budget` montre « connexion à… » indéfiniment.** Son
temps virtuel s'écoule avant la fin de la poignée de main WebSocket, et la
capture fige l'app dans un état qu'aucun utilisateur ne verra. Ce n'est pas
une panne. Pour trancher, attendre en temps réel — piloter Chrome par le
protocole DevTools — ou parler directement au WebSocket avec le jeton.

Non vérifiés à ce jour : la chaîne complète micro → réponse dans Home
Assistant (il faut l'assistant de 1.9, puis un micro ou un satellite), et
l'étape 3 à partir de 3.4.

**Le reste de l'étape 2 mérite un mot.** Tout ce qui y touche à Home
Assistant OS au-delà de 2.2 a été écrit sans Home Assistant OS sous la main :
le poste de dev fait tourner la pile Docker, et rien d'autre. Les noms des
modules complémentaires et la découverte automatique de 2.3 sont ce que la
documentation de Home Assistant annonce, pas ce qui a été constaté ici.
Corrigez ce fichier au fur et à mesure : c'est exactement ce qu'ont fait les
trois pannes du premier démarrage de l'étape 1, et les quatre de 2.2.
