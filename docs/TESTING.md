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

Attendu : les cinq ambiances, les trois lumières qui réagissent pour de vrai,
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

**a.** Home Assistant → Paramètres → Appareils et services → Ajouter une
intégration → **Music Assistant**, serveur `http://music-assistant:8095`.

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
courant, existence des entités que `config.ts` référence, playlists reçues et
chacune avec son URI, les cinq ambiances comparées à `scenes.yaml`, l'ajout à
chaud, et le build de l'app avec le jeton dedans. Sortie 0 si tout passe.

Le script ne contient aucune liste : il lit `scripts.yaml` pour savoir quelle
scène chaque ambiance allume, et `scenes.yaml` pour ce que cette scène doit
faire. Changer une luminosité ou ajouter une ambiance ne demande donc pas de
le modifier — et s'il diverge de Home Assistant, c'est que le dépôt et le Pi
ne disent plus la même chose, ce qui est précisément l'information voulue.

Il déclenche vraiment les ambiances : lancé sur le Pi à l'étape 3, il allumera
l'appartement.

## Ce que l'étape 1 ne peut pas prouver

Le réseau, l'app native, et tout le matériel. D'où les deux étapes suivantes.

---

# Étape 2 — le Pi est réel, les lampes et la sono ne le sont pas

Même pile, autre machine. On ne change **rien** à la configuration : on lance
le même `docker-compose.dev.yml` sur le Raspberry Pi. Les lumières restent
fausses, le son reste le fichier local.

Ce qui devient réel : l'ARM du Pi, le réseau local, la résolution de
`homeassistant.local`, et l'app **native** sur le natel plutôt qu'un onglet de
navigateur.

## 2.1 La pile sur le Pi

```bash
# sur le Pi
git clone git@github.com:celestin-rumo/casa-domotique.git
cd casa-domotique
docker compose -f docker-compose.dev.yml up -d
```

Refaire 1.2 (les logs) et 1.4 (les vérifications) depuis le poste de dev, en
remplaçant `localhost` par `homeassistant.local` ou l'IP du Pi. Si
`homeassistant.local` ne répond pas, c'est le mDNS : utilisez l'IP, et notez-le
— le natel aura le même problème.

## 2.2 Le CORS ne vous concerne pas

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

## 2.3 L'app comme un site — le chemin court

Avant de sortir Xcode : l'app est une PWA, et le compose sait la servir.
Sur le Pi, avec dans `app/.env` l'adresse du Pi **telle que le natel la
voit** (`VITE_HA_URL=http://192.168.1.50:8123`, pas `localhost`) :

```bash
docker compose --env-file app/.env -f docker-compose.dev.yml up --build -d app
```

Le conteneur construit l'app lui-même — ni Node ni npm sur le Pi — et la sert
sur `http://IP-du-Pi:8088`. Sur le natel : ouvrir cette adresse, puis
**Partager → Sur l'écran d'accueil** (iOS) ou **⋮ → Ajouter à l'écran
d'accueil** (Android). Plein écran, icône, pas de barre d'adresse. Changer
quelque chose, c'est relancer cette commande ; le natel recharge, rien à
réinstaller.

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

Le jeton est dans les fichiers servis, en clair : quiconque ouvre la page sur
le Wi-Fi pilote la maison. C'est le même jeton que dans l'`.apk`, mais ici il
suffit d'une adresse. Ne jamais exposer `:8088` hors du réseau local.

## 2.4 L'app native

```bash
cd app
# .env : VITE_HA_URL=http://homeassistant.local:8123 (ou l'IP)
npx cap add ios        # ou android
npm run cap:ios        # ou cap:android
```

Deux choses que cette étape teste et qu'aucune autre ne teste :

- **Le HTTP en clair.** Le Pi n'est pas en HTTPS. `capacitor.config.ts` porte
  déjà `cleartext: true` et `androidScheme: "http"` — c'est ici qu'on le vérifie.
- **Le jeton dans le build.** Il est embarqué par `import.meta.env` : si
  l'app native se connecte, c'est que le `.env` a bien été lu au moment du
  build. Changer de jeton impose de reconstruire.

## Ce que l'étape 2 ne peut pas prouver

Rien de ce qui touche à une ampoule, une enceinte, une TV ou le bouton mural.

---

# Étape 3 — tout est réel

On remplace les faux par les vrais, un domaine à la fois. Ne pas tout brancher
d'un coup : chaque sous-étape a ses propres pannes.

## 3.1 Passer à la vraie configuration

Jusqu'ici Home Assistant lisait `dev/configuration.yaml`. La configuration du
Pi est `homeassistant/configuration.yaml`, qui n'a ni fausses ampoules ni
fausses entités. Selon votre installation : les fichiers de `homeassistant/`
deviennent le `/config` de Home Assistant (installation HA OS), ou le montage
du compose change pour pointer dessus.

C'est aussi ici que l'automatisation du bouton mural revient : elle est
volontairement exclue du fichier de dev, parce que Home Assistant refuse de
charger un trigger dont le `device_id` n'existe pas, et le bloc entier
disparaîtrait.

## 3.2 Les lumières

Clé Zigbee branchée, intégration **ZHA**, appairage des 5 ampoules Hue.

Puis la seule chose qui compte : **leurs `entity_id` doivent être
`light.salon`, `light.cuisine`, `light.chambre`**. Paramètres → Entités →
renommer. Le dépôt n'a alors rien à changer.

```bash
curl -s -H "$H" http://homeassistant.local:8123/api/states/light.salon
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

## 3.5 La recette d'acceptation

Dans cet ordre, en regardant l'appartement :

1. Chaque ambiance : lumières **et** son, dans les bonnes pièces.
2. Le bouton mural déclenche Cinéma.
3. Une pièce s'allume et se règle depuis l'app, y compris la couleur.
4. Une playlist se choisit depuis l'app et joue dans les bonnes pièces.
5. Le natel est débranché du Wi-Fi : l'app doit **dire** qu'elle a perdu le Pi,
   pas faire semblant de marcher.

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
`curl` de 1.4, les cinq ambiances qui donnent aux trois lumières exactement les
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

Non vérifiés à ce jour : la partie son (1.6, qui demande les quatre étapes
manuelles de Music Assistant), et les étapes 2 et 3 dans leur entier.
