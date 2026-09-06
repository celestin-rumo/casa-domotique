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
docker compose -f docker-compose.dev.yml logs homeassistant | grep -iE "error|invalid config"
```

Aucune ligne citant `scenes.yaml`, `scripts.yaml` ou `input_selects.yaml` = tout
est chargé.

## 1.3 Un compte et un jeton

1. <http://localhost:8123> — créer le compte au premier écran.
2. Profil (en bas à gauche) → **Sécurité** → **Jetons d'accès de longue durée**.
   Le copier tout de suite : il ne s'affiche qu'une fois.

## 1.4 Vérifier chaque couche, sans l'app

```bash
TOKEN=collez_le_jeton_ici
H="Authorization: Bearer $TOKEN"
```

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
et **deux playlists dans la liste** — Détente et Chillos. Fête n'y est pas tant
que son URI n'est pas renseignée : une entrée sans adresse serait un bouton qui
ne joue rien.

## 1.6 Le son, sans compte Spotify

L'intégration Music Assistant **ne se configure pas en YAML**. C'est une
« config entry » : elle vit dans le `.storage/` de Home Assistant, son état
interne, et ne peut donc pas être livrée dans ce dépôt. Ces quatre étapes sont
manuelles, une fois.

`dev/music/` est monté sur `/media` et contient `signal-de-test.wav`, trois
secondes de notes montantes — de quoi entendre que la chaîne joue sans ouvrir
de compte nulle part. Déposez-y vos fichiers si vous préférez.

**a.** Home Assistant → Paramètres → Appareils et services → Ajouter une
intégration → **Music Assistant**, serveur `http://music-assistant:8095`
(le nom du service dans le compose ; les deux conteneurs partagent un réseau).

**b.** <http://localhost:8095> → Paramètres → Fournisseurs de musique →
**Filesystem**, dossier `/media`. Indexer : `signal-de-test.wav` doit
apparaître.

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

## 2.2 Autoriser l'origine du natel

Le piège le plus coûteux de cette étape. `npm run dev` affiche une URL réseau,
mais elle n'est **pas** dans `cors_allowed_origins`. Le navigateur bloque alors
la connexion WebSocket **sans message explicite** : ça ressemble à une app
cassée.

Ajoutez-la dans `dev/configuration.yaml` :

```yaml
http:
  cors_allowed_origins:
    - http://192.168.1.42:5173   # l'IP de votre poste de dev
```

puis `docker compose -f docker-compose.dev.yml restart homeassistant`.

## 2.3 L'app native

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

Cette pile est neuve et n'a pas encore été démarrée de bout en bout.
`docker-compose.dev.yml` est validé par `docker compose config` et les YAML du
dépôt se relisent sans erreur ; attendez-vous à un ajustement au premier
démarrage — l'étape 1.2 est là pour le rendre visible immédiatement.
