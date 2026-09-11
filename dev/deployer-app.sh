#!/usr/bin/env bash
# Déposer l'app sur le Pi, depuis le portable, en une commande.
#
#     dev/deployer-app.sh
#
# Le Pi ne construit pas l'app : Home Assistant OS n'a pas Node. Elle se
# construit ici, puis c'est le Pi qui vient la chercher, parce qu'il n'a ni
# serveur SSH ouvert ni Samba (docs/MISE-A-JOUR.md). Le script :
#
#   1. vérifie que app/.env vise bien le Pi, et non la pile Docker du portable ;
#   2. construit l'app et y glisse version.txt, le commit dont elle vient ;
#   3. ouvre le pare-feu au Pi seul, et le referme en sortant, quoi qu'il arrive ;
#   4. affiche la ligne à coller dans le terminal du Pi ;
#   5. sert l'archive une seule fois, au Pi seul, dix minutes au plus ;
#   6. vérifie que le Pi sert bien la nouvelle version.
set -euo pipefail

RACINE=$(cd "$(dirname "$0")/.." && pwd)
PORT=8765
cd "$RACINE/app"

# 1. app/.env doit viser le Pi. Un build pour localhost:8123, déposé sur le Pi,
#    donne une page qui s'ouvre et ne se connecte jamais.
url=$(grep -E '^VITE_HA_URL=' .env | cut -d= -f2- || true)
case "$url" in
  "") echo "app/.env n'a pas de VITE_HA_URL."; exit 1 ;;
  *localhost*|*127.0.0.1*|*:8123*)
    echo "app/.env vise $url : c'est la pile Docker du portable, pas le Pi."
    echo "Le Pi répond sur le port 80, sans :8123. Rien n'est déployé."
    exit 1 ;;
esac
hote=${url#*://}; hote=${hote%%/*}; hote=${hote%%:*}
pi=$(getent hosts "$hote" | awk '{print $1; exit}')
pi=${pi:-$hote}
# L'adresse du portable telle que le Pi la voit : celle de l'interface qui mène à lui.
moi=$(ip -4 route get "$pi" | grep -oP 'src \K[0-9.]+') || { echo "Pas de route vers le Pi ($pi)."; exit 1; }

# 2. Construire, et marquer la version.
echo "== construction de l'app, pour $url"
npm run build --silent
version=$(git -C "$RACINE" rev-parse --short HEAD)
git -C "$RACINE" diff --quiet HEAD -- app || version="$version+modifs"
echo "$version" > dist/version.txt
tmp=$(mktemp -d)
tar -C dist -czf "$tmp/casa.tar.gz" .

# 3. Le pare-feu : ouvert au Pi seul, refermé en sortant — Ctrl+C compris.
fermer() { rm -rf "$tmp"; }
if systemctl is-active --quiet ufw 2>/dev/null; then
  echo "== ouverture du port $PORT au Pi seul ($pi) : sudo va demander ton mot de passe"
  sudo ufw allow from "$pi" to any port "$PORT" proto tcp >/dev/null
  fermer() {
    sudo ufw delete allow from "$pi" to any port "$PORT" proto tcp >/dev/null
    rm -rf "$tmp"
    echo "== port $PORT refermé"
  }
fi
trap fermer EXIT

# 4. La ligne à coller sur le Pi. L'archive est téléchargée AVANT d'effacer
#    l'ancienne app : si le téléchargement échoue, la page en place ne bouge pas.
cat <<EOF

== Dans le terminal du Pi (module Terminal & SSH, pas ici), colle :

[ -d /config/www ] || echo "www NOUVEAU : redémarrer Home Assistant après"; curl -fsS --max-time 30 -o /tmp/casa.tar.gz http://$moi:$PORT/casa.tar.gz && mkdir -p /config/www/casa && rm -rf /config/www/casa/assets && tar -xzf /tmp/casa.tar.gz -C /config/www/casa && rm /tmp/casa.tar.gz && echo "app déposée : \$(cat /config/www/casa/version.txt)"

== En attente du Pi, dix minutes au plus…
EOF

# 5. Servir l'archive une fois, au Pi seul. Le pare-feu filtre déjà : on ne
#    compte pas que sur lui.
python3 - "$tmp/casa.tar.gz" "$moi" "$PORT" "$pi" <<'PY'
import http.server
import sys
import threading

fichier, hote, port, pi = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
with open(fichier, "rb") as f:
    donnees = f.read()
servie = threading.Event()


class Guichet(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.client_address[0] != pi:
            self.send_error(403)
            return
        if self.path != "/casa.tar.gz":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/gzip")
        self.send_header("Content-Length", str(len(donnees)))
        self.end_headers()
        self.wfile.write(donnees)
        print("   -> archive téléchargée par le Pi ({} octets)".format(len(donnees)), flush=True)
        servie.set()

    def log_message(self, *args):
        pass


serveur = http.server.HTTPServer((hote, port), Guichet)
threading.Thread(target=serveur.serve_forever, daemon=True).start()
if not servie.wait(600):
    print("   personne n'est venu la chercher en dix minutes : arrêt, rien n'a bougé sur le Pi.", flush=True)
    sys.exit(1)
serveur.shutdown()
PY

# 6. Ce que le Pi sert maintenant.
sleep 3
servie=$(curl -fsS --max-time 5 "http://$pi/local/casa/version.txt" 2>/dev/null || true)
if [ "$servie" = "$version" ]; then
  echo "✓ le Pi sert l'app $version"
else
  echo "✗ le Pi sert « ${servie:-rien} », attendu $version : voir docs/MISE-A-JOUR.md, « Pannes »"
  exit 1
fi
