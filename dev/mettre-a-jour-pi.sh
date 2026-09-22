#!/bin/sh
# Mettre le Pi à jour depuis GitHub, et savoir ce qu'il reste à faire.
# Dans le terminal du module Terminal & SSH :
#
#     sh /config/casa-domotique/dev/mettre-a-jour-pi.sh
#
# Il tire le dépôt, puis vérifie quatre choses. Faite à la main, la mise à
# jour en oublie toujours une (docs/MISE-A-JOUR.md) :
#
#   - la configuration de Home Assistant : ce qui a changé sous homeassistant/
#     depuis la dernière version APPLIQUÉE, et non depuis le dernier pull. Un
#     pull sans redémarrage laisse les nouveaux helpers inexistants, et le pull
#     suivant répond « Already up to date » comme si tout était en place ;
#   - /config/configuration.yaml : une copie de pi/configuration.yaml, que git
#     ne met jamais à jour ;
#   - les phrases vocales : Home Assistant les relit en redémarrant, mais
#     Speech-to-Phrase, lui, ne réapprend qu'en redémarrant lui aussi. Sans
#     ça le micro reste sourd à une phrase que le clavier comprend déjà ;
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
phrases=0
for f in $changes; do
  case "$f" in
    # La graine des scènes : celles du Pi appartiennent à Home Assistant.
    homeassistant/scenes.yaml) graine=1 ;;
    # Une référence, chargée par aucune installation.
    homeassistant/configuration.yaml) ;;
    # Les phrases vocales sont lues DEUX FOIS : par Home Assistant, qui en
    # tire les intents, et par Speech-to-Phrase, qui en tire son vocabulaire.
    # Redémarrer Home Assistant seul laisse donc le micro sourd aux nouvelles
    # phrases, sans que rien ne le dise. Doit précéder le motif générique.
    homeassistant/custom_sentences/*) redemarrer=1; phrases=1; echo "   $f" ;;
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

# 4. Les phrases vocales, qui doivent vivre à DEUX endroits.
#
# Home Assistant les lit dans /config/custom_sentences, et c'est pour lui que
# le lien symbolique existe. Le module Speech-to-Phrase, lui, ne voit pas ce
# dossier DU TOUT : son config.yaml ne déclare que `map: [share:rw]`, donc son
# conteneur n'a pas de /config. Il lit /share/speech-to-phrase/custom_sentences,
# et y prend n'importe quel *.yaml du sous-dossier de langue.
#
# Sans cette recopie, une phrase ajoutée est comprise au clavier et reste
# inaudible au micro : le satellite ne renvoie aucun texte, et tout donne à
# croire qu'il est sourd alors qu'il n'a jamais appris le mot.
#
# Diagnostiqué le 22 septembre 2026, après avoir cherché du côté du lien
# symbolique, qui n'y était pour rien : le fichier était bien là, mais dans un
# dossier que le module ne monte pas.
PHRASES_SRC=$DEPOT/homeassistant/custom_sentences
PHRASES_DST=${CASA_PHRASES:-/share/speech-to-phrase/custom_sentences}
if [ "$phrases" = 1 ] || [ ! -d "$PHRASES_DST" ]; then
  echo "== les phrases vocales, vers $PHRASES_DST"
  if [ ! -d "$PHRASES_SRC" ]; then
    echo "   $PHRASES_SRC est absent : rien à copier"
  else
    for langue in "$PHRASES_SRC"/*/; do
      [ -d "$langue" ] || continue
      nom=$(basename "$langue")
      mkdir -p "$PHRASES_DST/$nom"
      cp "$langue"*.yaml "$PHRASES_DST/$nom/" 2>/dev/null || true
      echo "   $nom : $(ls "$PHRASES_DST/$nom" 2>/dev/null | tr '\n' ' ')"
    done
    if demander "Redémarrer Speech-to-Phrase pour qu'il les réapprenne ?"; then
      if ha addons restart core_speech-to-phrase; then
        echo "   redémarré : il réapprend son vocabulaire"
      else
        echo "   échec : module absent ou sous un autre nom (ha addons list)"
      fi
    else
      echo "   pas redémarré : les nouvelles phrases ne seront pas entendues"
    fi
  fi
fi

# 5. L'app servie par le Pi.
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
