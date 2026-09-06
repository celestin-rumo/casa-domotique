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

- `src/ha.ts` — connexion WebSocket + services Home Assistant
- `src/config.ts` — vos entity_id (scènes, enceinte, lumières)
- `src/native.ts` — plugins Capacitor (haptique, status bar)
- `capacitor.config.ts` — config native (autorise le HTTP local vers le Pi)
