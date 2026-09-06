# Architecture

App (natel, Capacitor) ─HTTP/WS─▶ Raspberry Pi (Home Assistant + Music Assistant)
  ├─ Zigbee (clé USB, ZHA) ─▶ 5 ampoules Hue, bouton mural
  └─ Wi-Fi / Ethernet ─▶ TV LG (webOS), Sonos Beam (HDMI eARC), 4 × Sonos Era 100

## Entity_id à renseigner

| Rôle | entity_id |
|---|---|
| Lumière salon | light.salon |
| Lumière cuisine | light.cuisine |
| Lumière chambre | light.chambre |
| TV | media_player.lg_tv |
| Barre (Sonos) | media_player.sonos_beam |
| Salon (Music Assistant) | media_player.ma_salon |
| Cuisine (Music Assistant) | media_player.ma_cuisine |
| Chambre (Music Assistant) | media_player.ma_chambre |

Les vrais noms sont dans Paramètres → Appareils et services → Entités.
