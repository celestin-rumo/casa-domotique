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

## 6. Le son, sans compte Spotify

L'intégration Music Assistant **ne se configure pas en YAML** : c'est une
« config entry », elle vit dans le `.storage/` de Home Assistant, qui est son
état interne. Elle ne peut donc pas être livrée dans ce dépôt — ces quatre
étapes sont à faire une fois, à la main.

`dev/music/` est monté sur `/media` dans Music Assistant et contient
`signal-de-test.wav`, trois secondes de notes montantes. De quoi entendre que
la chaîne marche sans ouvrir de compte nulle part. Déposez-y vos propres
fichiers si vous préférez.

**a. Brancher Music Assistant à Home Assistant**

Paramètres → Appareils et services → Ajouter une intégration → Music
Assistant. Serveur : `http://music-assistant:8095` — c'est le nom du service
dans le compose, les deux conteneurs partagent un réseau.

**b. Donner de la musique à Music Assistant**

<http://localhost:8095> → Paramètres → Fournisseurs de musique → ajouter un
fournisseur **Filesystem**, dossier `/media`. Lancer l'indexation :
`signal-de-test.wav` doit apparaître dans la bibliothèque.

**c. Un lecteur, sans enceinte**

Music Assistant a un lecteur intégré qui joue dans l'onglet du navigateur.
Une fois activé, il remonte dans Home Assistant comme une entité
`media_player.*`.

**d. Le renommer — c'est l'étape qui fait tout marcher**

Ce lecteur portera un nom automatique. Home Assistant → Paramètres → Entités →
le sélectionner → Paramètres → **changer l'ID d'entité** en
`media_player.ma_salon`.

À partir de là, `scripts.yaml`, `config.ts` et les ambiances fonctionnent
**sans être modifiés** : ils visent `media_player.ma_salon`, et c'est
maintenant ce lecteur. C'est plus propre que d'éditer le dépôt pour le dev
et de risquer de committer la modification.

**e. Entendre quelque chose**

`script.play_playlist` traduit un *nom* en URI, et les URI de la table sont
des playlists Spotify — sans compte Spotify, aucune ne résout. Pour un essai
local, trouvez d'abord un `media_id` que Music Assistant accepte : Outils de
développement → Actions → `music_assistant.play_media`, cible
`media_player.ma_salon`, et essayez le nom du morceau. Le lecteur du
navigateur doit jouer.

Une fois ce `media_id` connu, ajoutez-le à la table de `script.play_playlist` :

```yaml
  variables:
    playlists:
      Test: "<le media_id qui a marché>"
      Détente: "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO"
```

et le nom `Test` dans `input_selects.yaml`. Rechargez le YAML : « Test »
apparaît dans l'app, et l'appuyer joue le fichier. **Vous venez de faire le
tour complet** — ajouter une playlist, deux lignes sur le Pi, aucune
reconstruction de l'app.

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
