# ha-moods

Domotique maison : lumières, musique, ambiances, un réveil en lever de soleil et un assistant vocal, pilotés par un Raspberry Pi (Home Assistant + Music Assistant + Wyoming), avec une app natel React + Capacitor.

**Une seule pièce pour l'instant : la chambre.** Quatre lumières — une lampe et un bandeau Hue, deux ampoules WiZ — une enceinte, cinq ambiances. Les autres pièces, le multiroom et le home cinéma viendront avec le matériel — voir [« Une seule pièce, la chambre »](docs/TESTING.md#une-seule-pièce-la-chambre).

- `docker-compose.dev.yml` — la pile sur le poste de dev : fausses ampoules, son en fichier local
- `pi/configuration.yaml` — la configuration du Pi, qui tourne sous Home Assistant OS
- `docker-compose.pi.yml` — un Pi sous Docker plutôt que Home Assistant OS, pour qui en a besoin (voir TESTING.md 2.8)
- `app/` — l'application (voir son README pour le build natif)
- `homeassistant/` — scènes, scripts et automatisations à copier sur le Pi (`/config`) ; `packages/` porte le réveil et la météo, `custom_sentences/fr/` ce que la voix entend et comprend
- `docs/` — [le schéma complet](docs/architecture.md) et [comment tester sans Pi](docs/TESTING.md)

## Démarrage rapide

Sans Raspberry Pi, sans ampoule et sans enceinte :

```bash
docker compose -f docker-compose.dev.yml up     # Home Assistant sur :8123, Music Assistant, whisper, piper
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
