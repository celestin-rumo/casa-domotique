# Tester sans Raspberry Pi

Home Assistant et Music Assistant tournent aussi bien dans deux conteneurs sur
un portable que sur un Pi. Avec `dev/configuration.yaml`, `light.salon` existe
sans qu'aucune ampoule soit branchée : les trois lumières sont des *template
lights* adossées à des `input_boolean` et des `input_number`.

Rien de ce dépôt n'est écrit par Home Assistant. `homeassistant/` est monté en
**lecture seule** sur `/config/casa` ; la base, les journaux et les secrets
vont dans un volume Docker.

## 1. Démarrer

```bash
docker compose -f docker-compose.dev.yml up
```

Le premier démarrage prend quelques minutes : Home Assistant installe ses
dépendances avant d'ouvrir le port.

## 2. Vérifier que les fichiers du dépôt ont bien été chargés

C'est l'étape qui attrape 90 % des problèmes, et il faut la faire *avant*
d'ouvrir l'app — une erreur de YAML n'empêche pas Home Assistant de démarrer,
elle fait juste disparaître le bloc fautif.

```bash
docker compose -f docker-compose.dev.yml logs homeassistant | grep -iE "error|invalid config"
```

Aucune ligne mentionnant `scenes.yaml`, `scripts.yaml` ou `input_selects.yaml`
= tout est chargé.

## 3. Créer un compte et un jeton

1. <http://localhost:8123> — créer le compte au premier écran.
2. Profil (en bas à gauche) → onglet **Sécurité** → **Jetons d'accès de longue
   durée** → en créer un, et le copier tout de suite : il ne s'affiche qu'une
   fois.

## 4. Vérifier chaque couche, sans ouvrir l'app

```bash
TOKEN=collez_le_jeton_ici
H="Authorization: Bearer $TOKEN"
```

**Les lumières existent :**

```bash
curl -s -H "$H" http://localhost:8123/api/states/light.salon
# → {"entity_id":"light.salon","state":"off", ...}
```

**La liste des playlists est là, avec ses options :**

```bash
curl -s -H "$H" http://localhost:8123/api/states/input_select.playlist
# → "attributes":{"options":["Détente"], ...}
```

C'est exactement ce que l'app lit pour construire sa liste. Ajouter un nom
dans `homeassistant/input_selects.yaml`, recharger (Outils de développement →
YAML → Recharger, ou redémarrer le conteneur), et il apparaît ici — puis dans
l'app, sans reconstruire quoi que ce soit. **C'est la propriété que ce montage
existe pour prouver.**

**Les scripts sont enregistrés :**

```bash
curl -s -H "$H" http://localhost:8123/api/states/script.play_playlist
curl -s -H "$H" http://localhost:8123/api/states/script.mood_detente
```

**Une ambiance change vraiment l'état des lumières :**

```bash
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"entity_id":"script.mood_detente"}' \
  http://localhost:8123/api/services/script/turn_on

curl -s -H "$H" http://localhost:8123/api/states/light.salon
# → "state":"on"  (la moitié « lumière » de l'ambiance a été appliquée)
```

La moitié « son » échouera tant que Music Assistant n'est pas branché — voir
l'étape 6. C'est attendu, et le reste de l'ambiance s'applique quand même.

## 5. Lancer l'app contre ce Home Assistant

```bash
cd app
npm install
cp .env.example .env
```

Dans `.env` :

```
VITE_HA_URL=http://localhost:8123
VITE_HA_TOKEN=le_même_jeton_qu'à_l'étape_3
```

```bash
npm run dev      # affiche aussi une URL réseau, utilisable depuis le natel
```

Les origines de développement sont déjà autorisées dans `dev/configuration.yaml`
(`http://localhost:5173`). Si vous ouvrez depuis le natel avec l'URL réseau,
ajoutez-la à `cors_allowed_origins` et redémarrez le conteneur — sinon le
navigateur bloque la connexion WebSocket sans rien dire d'explicite.

## 6. Le son, si vous en voulez

Music Assistant tourne dans le conteneur voisin mais reste à brancher :

1. Home Assistant → Paramètres → Appareils et services → **Ajouter une
   intégration** → Music Assistant.
2. Serveur : `http://music-assistant:8095`.
3. Dans Music Assistant, ajouter un fournisseur **Spotify** et s'y connecter.
4. Les lecteurs apparaissent en `media_player.*`. Leurs noms ne seront pas
   `ma_salon` / `ma_cuisine` / `ma_chambre` sans enceintes réelles : adapter
   `app/src/config.ts` et `homeassistant/scripts.yaml`, ou s'en tenir aux
   lumières.

## Ce qui ne marchera jamais sans matériel

Le **bouton mural** est un appareil Zigbee. Son automatisation est
volontairement exclue de `dev/configuration.yaml` : Home Assistant refuse de
charger un trigger dont le `device_id` n'existe pas, et le bloc entier
disparaîtrait.

## Repartir de zéro

```bash
docker compose -f docker-compose.dev.yml down -v
```

`-v` supprime aussi le volume, donc le compte, le jeton et l'historique.

---

Ce montage est neuf et n'a pas encore été démarré de bout en bout. Le fichier
`docker-compose.dev.yml` est validé par `docker compose config`, et les YAML du
dépôt se relisent sans erreur ; attendez-vous quand même à un ajustement au
premier démarrage, et l'étape 2 est là pour le rendre visible tout de suite.
