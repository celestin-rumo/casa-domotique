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
python3 ../dev/verifier.py                      # rejoue toute l'étape 1
```

[`docs/TESTING.md`](docs/TESTING.md) découpe la mise en route en trois étapes —
tout faux sur le portable, puis le Pi avec du matériel encore faux, puis tout
réel — chacune n'ajoutant qu'une source de panne.

Sur le natel, le chemin court est l'app **comme un site** : le compose la
construit et la sert sur `http://IP-du-Pi:8088`, à épingler sur l'écran
d'accueil (voir 2.3). `npx cap add ios` ou `android` restent là pour l'app
native, avec l'haptique.
