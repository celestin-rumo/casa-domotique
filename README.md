# ha-moods

Domotique maison : home cinéma, musique multiroom et lumières pilotés par un Raspberry Pi (Home Assistant + Music Assistant), avec une app natel React + Capacitor.

- `app/` — l'application (voir son README pour le build natif)
- `homeassistant/` — scènes, scripts et automatisations à copier sur le Pi (`/config`)
- `docs/` — [le schéma complet](docs/architecture.md) et [comment tester sans Pi](docs/TESTING.md)

## Démarrage rapide

Sans Raspberry Pi, sans ampoule et sans enceinte :

```bash
docker compose -f docker-compose.dev.yml up     # Home Assistant sur :8123
cd app && npm install && cp .env.example .env   # y coller l'URL et un jeton
npm run dev
```

La procédure complète, avec les vérifications à faire à chaque étape, est dans
[`docs/TESTING.md`](docs/TESTING.md). Puis `npx cap add ios` ou `android` pour
l'app native.
