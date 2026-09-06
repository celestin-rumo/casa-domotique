# Architecture

Tout ce que fait cette installation, et où chaque chose tourne.

## Le système entier

```mermaid
flowchart TB
    subgraph natel["Natel — React + Vite + Capacitor"]
        app["App.tsx<br/>ambiances, volume, lumières, playlists"]
        hats["ha.ts<br/>WebSocket + appels de service"]
        cfg["config.ts<br/>les entity_id"]
        app --> hats
        app --> cfg
    end

    subgraph pi["Raspberry Pi"]
        subgraph hass["Home Assistant"]
            sel["input_select.playlist<br/>la liste des playlists"]
            pp["script.play_playlist<br/>seule table nom → URI"]
            moods["script.mood_*<br/>cinema · detente · fete<br/>chillos · off"]
            scenes["scene.*<br/>l'état des lumières"]
            auto["automation<br/>bouton mural"]
        end
        mass["Music Assistant"]
    end

    hue["5 ampoules Hue<br/>+ bouton mural"]
    tv["TV LG · webOS"]
    beam["Sonos Beam · HDMI eARC"]
    era["4 × Sonos Era 100"]
    spotify["Spotify"]

    hats -- "WebSocket :8123" --> hass
    hass -- "état de toutes les entités" --> hats

    moods --> scenes
    moods --> pp
    sel -. "options lues par l'app" .-> hats
    pp -- "écrit le choix" --> sel
    auto --> moods

    scenes -- "Zigbee · ZHA" --> hue
    hue -- "appui · ZHA" --> auto
    moods -- "réseau" --> tv
    moods -- "réseau" --> beam
    pp --> mass
    mass -- "réseau" --> era
    mass --> spotify
```

## Le trajet d'un appui

L'app n'attend jamais le Pi pour répondre. Elle répond, puis se fait confirmer.

```mermaid
sequenceDiagram
    participant D as Doigt
    participant A as App
    participant H as Home Assistant
    participant L as Ampoules

    D->>A: appui sur une ambiance
    Note over A: 0 ms — échelle 0,965 + haptique,<br/>état affiché comme acquis
    A->>H: callService(script, turn_on)
    H->>L: scene.turn_on → Zigbee
    L-->>H: nouvel état
    H-->>A: subscribeEntities
    Note over A: c'est cet écho qui confirme,<br/>pas la réponse au service
```

Si l'écho n'arrive pas, l'affichage revient à son état précédent **en nommant
l'entité** qui n'a pas répondu, jamais par un message anonyme.

## Les playlists

La liste ne vit pas dans le build de l'app. Le jeton d'accès y étant embarqué,
y toucher voudrait dire reconstruire l'app et la réinstaller sur le natel à
chaque playlist ajoutée.

```mermaid
flowchart LR
    ins["input_selects.yaml<br/>les noms proposés"] --> sel["input_select.playlist"]
    sel -- "attribut options" --> app["Liste dans l'app"]
    app -- "script.play_playlist(name)" --> pp["play_playlist"]
    pp -- "table playlists" --> uri["spotify:playlist:…"]
    uri --> ma["music_assistant.play_media"]
    pp -- "select_option" --> sel
```

`script.play_playlist` est **la seule table nom → URI du dépôt**. Les ambiances
l'appellent au lieu de porter chacune leur adresse, il refuse un nom absent de
la table plutôt que d'envoyer un `media_id` vide, et il écrit le choix dans le
helper — c'est cette écriture, revenue par le WebSocket, qui allume le bouton
dans l'app.

Ajouter une playlist, c'est donc **deux lignes sur le Pi et aucun rebuild** :
son URI dans la table de `scripts.yaml`, son nom dans `input_selects.yaml`.
N'ajouter un nom que lorsque son URI est renseignée : une entrée sans adresse
serait un bouton qui ne joue rien.

`radio_mode` est un paramètre du script, pas une décision du script. Détente
le passe à `true` — la playlist sert de graine et la lecture part ailleurs
après quelques titres. Chillos ne le passe pas, donc sa playlist se joue telle
quelle.

## Les entity_id à renseigner

| Rôle | entity_id | État |
|---|---|---|
| Lumière salon | `light.salon` | liée |
| Lumière cuisine | `light.cuisine` | liée |
| Lumière chambre | `light.chambre` | liée |
| TV | `media_player.lg_tv` | liée |
| Barre (Sonos) | `media_player.sonos_beam` | liée |
| Salon (Music Assistant) | `media_player.ma_salon` | liée |
| Cuisine (Music Assistant) | `media_player.ma_cuisine` | liée |
| Chambre (Music Assistant) | `media_player.ma_chambre` | à vérifier |
| Bouton mural (ZHA) | `device_id` dans `automations.yaml` | **gabarit** |
| Playlist Chillos | table de `script.play_playlist` | définie |
| Ambiance Fête | `script.mood_fete` | **n'existe pas** |

Les vrais noms sont dans Paramètres → Appareils et services → Entités.

## Tester sans Raspberry Pi

Home Assistant et Music Assistant tournent aussi bien dans deux conteneurs sur
un portable. `dev/configuration.yaml` inclut les fichiers du dépôt et ajoute
trois fausses ampoules, de sorte que `light.salon` existe sans qu'aucune
ampoule soit branchée, et `dev/music/` sert de bibliothèque locale pour
entendre quelque chose sans compte Spotify.

```bash
docker compose -f docker-compose.dev.yml up
```

La procédure complète, avec à chaque couche la commande qui prouve qu'elle
marche, est dans [TESTING.md](TESTING.md) — elle n'est pas répétée ici, pour
qu'il n'y ait qu'un endroit à tenir à jour.

Le dépôt n'est jamais écrit par Home Assistant : `homeassistant/` est monté en
lecture seule sur `/config/casa`, et la base, les journaux et les secrets vont
dans un volume Docker.

## Ce qui tourne où

| | Raspberry Pi | Natel | Poste de dev |
|---|---|---|---|
| Home Assistant | ✓ | | ✓ (conteneur) |
| Music Assistant | ✓ | | ✓ (conteneur) |
| L'app | | ✓ | ✓ (`npm run dev`) |
| Le jeton d'accès | | dans le build | dans `.env` |

Le jeton de longue durée est embarqué dans le build de l'app : l'`.apk` et
l'`.ipa` le contiennent en clair. L'app reste privée et ne se distribue pas.
