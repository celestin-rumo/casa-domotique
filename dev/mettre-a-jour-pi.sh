#!/bin/sh
# Mettre le Pi à jour depuis GitHub, et savoir ce qu'il reste à faire.
# Dans le terminal du module Terminal & SSH :
#
#     sh /config/casa-domotique/dev/mettre-a-jour-pi.sh
#
# Il tire le dépôt, puis vérifie trois choses. Faite à la main, la mise à
# jour en oublie toujours une (docs/MISE-A-JOUR.md) :
#
#   - la configuration de Home Assistant : ce qui a changé sous homeassistant/
#     depuis la dernière version APPLIQUÉE, et non depuis le dernier pull. Un
#     pull sans redémarrage laisse les nouveaux helpers inexistants, et le pull
#     suivant répond « Already up to date » comme si tout était en place ;
#   - /config/configuration.yaml : une copie de pi/configuration.yaml, que git
#     ne met jamais à jour ;
#   - l'app servie par le Pi : son version.txt, face au dernier commit qui
#     touche app/. Elle ne se construit pas ici, mais sur le portable avec
#     dev/deployer-app.sh.
#
# Il ne redémarre rien sans le demander, et jamais sur une configuration que
# `ha core check` refuse. Écrit pour le sh du module (busybox) : rien de bash.
set -eu

DEPOT=${CASA_DEPOT:-/config/casa-domotique}
CONFIG=${CASA_CONFIG:-/config}
MARQUE=$CONFIG/.casa-appliquee

demander() {
  printf '%s [o/N] ' "$1"
  read -r reponse || reponse=
  [ "$reponse" = o ] || [ "$reponse" = O ]
}

cd "$DEPOT"
echo "== git pull"
git pull --ff-only
tete=$(git rev-parse --short HEAD)

# 1. Ce qui n'a pas encore été appliqué.
appliquee=$(cat "$MARQUE" 2>/dev/null || true)
if [ -n "$appliquee" ] && git cat-file -e "$appliquee^{commit}" 2>/dev/null; then
  changes=$(git diff --name-only "$appliquee" HEAD -- homeassistant)
  echo "== homeassistant/, depuis $appliquee (dernière version appliquée) :"
else
  changes=$(git ls-files homeassistant)
  echo "== homeassistant/ : aucune version appliquée connue, tout compte comme neuf"
fi

redemarrer=0
graine=0
for f in $changes; do
  case "$f" in
    # La graine des scènes : celles du Pi appartiennent à Home Assistant.
    homeassistant/scenes.yaml) graine=1 ;;
    # Une référence, chargée par aucune installation.
    homeassistant/configuration.yaml) ;;
    homeassistant/*) redemarrer=1; echo "   $f" ;;
  esac
done
[ "$redemarrer" = 1 ] || echo "   rien qui demande un redémarrage"
if [ "$graine" = 1 ]; then
  echo "   homeassistant/scenes.yaml a changé : c'est la graine, pas les scènes du Pi."
  echo "   Rien à faire, les tiennes ne bougent pas (docs/MISE-A-JOUR.md)."
fi

# 2. configuration.yaml, la copie que git ne touche jamais.
if ! cmp -s pi/configuration.yaml "$CONFIG/configuration.yaml"; then
  echo "== $CONFIG/configuration.yaml diffère de pi/configuration.yaml :"
  diff -u "$CONFIG/configuration.yaml" pi/configuration.yaml | head -40 || true
  if demander "Le remplacer par celui du dépôt ?"; then
    cp "$CONFIG/configuration.yaml" "$CONFIG/configuration.yaml.avant-$tete"
    cp pi/configuration.yaml "$CONFIG/configuration.yaml"
    echo "   remplacé ; l'ancien est gardé dans configuration.yaml.avant-$tete"
    redemarrer=1
  fi
fi

# 3. Redémarrer, seulement sur une configuration que Home Assistant accepte.
if [ "$redemarrer" = 1 ]; then
  echo "== ha core check"
  ha core check || { echo "   configuration refusée : rien n'est redémarré"; exit 1; }
  if demander "Redémarrer Home Assistant maintenant ?"; then
    ha core restart
    echo "$tete" > "$MARQUE"
    echo "   redémarré : version $tete appliquée"
  elif demander "Home Assistant a-t-il déjà redémarré depuis ce pull ?"; then
    echo "$tete" > "$MARQUE"
    echo "   noté : version $tete appliquée"
  else
    echo "   pas redémarré : ce script le proposera encore la prochaine fois"
  fi
else
  echo "$tete" > "$MARQUE"
fi

# 4. L'app servie par le Pi.
derniere=$(git log -1 --format=%h -- app)
servie=$(cat "$CONFIG/www/casa/version.txt" 2>/dev/null || true)
construite=${servie%%+*}
echo "== l'app"
if [ -z "$servie" ]; then
  echo "   version servie inconnue (déposée avant version.txt, ou jamais déposée)"
  echo "   -> la redéployer depuis le portable : dev/deployer-app.sh"
elif ! git cat-file -e "$construite^{commit}" 2>/dev/null; then
  echo "   servie : $servie, un commit que ce dépôt ne connaît pas (jamais poussé ?)"
  echo "   -> la redéployer depuis le portable une fois le commit poussé : dev/deployer-app.sh"
elif git merge-base --is-ancestor "$derniere" "$construite"; then
  echo "   à jour : servie $servie, dernier changement de app/ en $derniere"
else
  echo "   périmée : servie $servie, alors que app/ a changé en $derniere"
  echo "   -> la redéployer depuis le portable : dev/deployer-app.sh"
fi
