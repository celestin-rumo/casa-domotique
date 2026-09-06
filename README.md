# ha-moods

Domotique maison : home cinéma, musique multiroom et lumières pilotés par un Raspberry Pi (Home Assistant + Music Assistant), avec une app natel React + Capacitor.

- `app/` — l'application (voir son README pour le build natif)
- `homeassistant/` — scènes, scripts et automatisations à copier sur le Pi (`/config`)
- `docs/` — schéma et liste des entity_id

## Démarrage rapide

```bash
git clone git@github.com:celestin-rumo/casa-domotique.git && cd casa-domotique/app
npm install && cp .env.example .env
npm run dev
```

Puis `npx cap add ios` ou `android` pour l'app native.
