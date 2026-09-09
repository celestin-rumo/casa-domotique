# Moods — app

React + Vite + Capacitor. Pilote Home Assistant (scènes, volume, lumières) via WebSocket.

## Développement (navigateur)

```bash
npm install
cp .env.example .env     # VITE_HA_URL + VITE_HA_TOKEN
npm run dev              # URL réseau utilisable sur le natel
```

## App native (Capacitor)

Une seule fois :

```bash
npx cap add ios          # nécessite Xcode (macOS)
npx cap add android      # nécessite Android Studio
```

Ensuite, à chaque modification :

```bash
npm run cap:ios          # build + sync + ouvre Xcode
npm run cap:android      # build + sync + ouvre Android Studio
npm run cap:live         # Android : rechargement à chaud sur le téléphone
```

Dans Xcode / Android Studio : sélectionner votre téléphone et lancer.

Le token est embarqué dans le build (`import.meta.env`). Gardez l'app privée, ne la distribuez pas.

## Structure

- `src/ha.ts` — connexion WebSocket, événements de liaison, services Home Assistant, latence
- `src/maison.tsx` — l'état de la maison et la seule façon d'agir dessus : `agir()` nomme l'entité qui refuse, les ambiances attendent l'écho de `input_select.mood`
- `src/App.tsx` — la coquille : en-tête, quatre onglets, l'écran qui défile
- `src/vues/` — un fichier par onglet : `Ambiances`, `Pieces`, `Ecoute`, `Reglages` ; `Reveil` est la carte du réveil, posée sur Ambiances
- `src/ui.tsx` — les briques communes : carte, interrupteur, curseur qui n'envoie qu'au lâcher, pastille, note de faute
- `src/config.ts` — vos entity_id (ambiances et leur ligne descriptive, enceintes, lumières, appareils) et le délai d'écho

Le dessin de référence est le wireframe cliquable « Moods, l'app de gestion »
(artifact claude.ai) : quatre durées d'animation, une seule couleur d'action,
l'attente dans un trait de 1,5 px plutôt qu'un spinner, la faute sur la carte
de l'entité qui a refusé. Ce qu'il propose et que l'app ne fait pas : éditer
une ambiance depuis le natel — une ambiance est du YAML sur le Pi, l'app ne
peut pas l'écrire, et une feuille « Enregistrer » qui n'enregistre rien
mentirait.
- `src/native.ts` — plugins Capacitor (haptique, status bar)
- `capacitor.config.ts` — config native (autorise le HTTP local vers le Pi)
