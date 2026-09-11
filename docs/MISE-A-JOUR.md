# Mettre à jour le Pi

Un changement poussé sur GitHub n'arrive pas tout seul dans la maison. Trois
choses vivent sur le Pi, et chacune y arrive par son propre chemin :

| Quoi | Où, sur le Pi | Comment ça arrive |
|---|---|---|
| La configuration Home Assistant — scripts, réveil, playlists, phrases vocales | `/config/casa-domotique`, un clone du dépôt | `git pull`, **puis un redémarrage** |
| `configuration.yaml` | `/config/configuration.yaml` | une **copie** de `pi/configuration.yaml`, que `git pull` ne touche jamais |
| L'app | `/config/www/casa`, publiée sous `/local/casa/` | construite **sur le portable**, puis déposée : le Pi n'a pas Node |

Et trois choses n'arrivent **jamais** par une mise à jour, volontairement :

- **les scènes.** Elles appartiennent à Home Assistant depuis qu'on les règle
  dans l'interface (`/config/scenes.yaml`). `homeassistant/scenes.yaml` n'est
  que la graine d'une installation neuve : la modifier ne change rien sur le
  Pi, et c'est ce qui protège tes réglages ;
- **les réglages** — l'heure du réveil, sa courbe, les playlists épinglées.
  Ce sont des helpers, dont Home Assistant garde la valeur ;
- **les comptes, intégrations et modules** : ZHA, Music Assistant, Spotify.

---

## En deux commandes

**1. Sur le Pi**, dans le terminal du module Terminal & SSH :

```bash
sh /config/casa-domotique/dev/mettre-a-jour-pi.sh
```

Il tire le dépôt, puis te dit ce qu'il reste à faire, et le fait si tu
réponds `o` :

- **redémarrer Home Assistant**, si quelque chose a changé sous
  `homeassistant/` depuis la dernière version *appliquée* — pas seulement
  depuis le dernier `pull`. Il vérifie la configuration par `ha core check`
  avant, et ne redémarre jamais une configuration refusée ;
- **recopier `configuration.yaml`**, s'il diffère de `pi/configuration.yaml`.
  Il te montre la différence d'abord, et garde l'ancien à côté ;
- **redéployer l'app**, si celle que sert le Pi est plus ancienne que le
  dernier changement de `app/`. Ça, il ne peut pas le faire lui-même : il te
  renvoie à la commande suivante.

**2. Seulement si le script le demande : sur le portable**, dans le dossier
du dépôt :

```bash
dev/deployer-app.sh
```

Il construit l'app, ouvre le pare-feu du portable au Pi seul — `sudo`
demande ton mot de passe —, puis affiche **une ligne à coller dans le
terminal du Pi**. Le Pi vient chercher l'archive, le script referme le port
et vérifie que le Pi sert bien la nouvelle version :

```
✓ le Pi sert l'app e9662b0
```

C'est tout. La suite explique ce que font ces deux scripts, pour les
comprendre ou s'en passer.

---

## Ce qui demande quoi

Le script du Pi fait ce tri tout seul. Le voici en clair :

| Ce qui a changé | Ce qu'il faut sur le Pi |
|---|---|
| `homeassistant/packages/…`, `scripts.yaml`, `input_selects.yaml` | redémarrer |
| `homeassistant/custom_sentences/…` (ce que la voix comprend) | redémarrer : les phrases sont lues au démarrage |
| `pi/configuration.yaml` | le recopier dans `/config`, puis redémarrer |
| `app/…` | redéployer l'app depuis le portable |
| `homeassistant/scenes.yaml` | **rien** — c'est la graine |
| `docs/`, `dev/`, `README.md`, `docker-compose*` | rien |

**Pourquoi redémarrer, et pas seulement recharger.** Outils de
développement → YAML sait recharger les scripts, les scènes et les
automatisations sans redémarrer. Mais un **nouveau** helper — un nouveau
réglage du réveil, par exemple — n'existe qu'après un redémarrage complet.
Le 11 septembre 2026, le dépôt était tiré depuis la veille, et aucun des
onze réglages du réveil n'existait : Home Assistant n'avait pas redémarré.
Le script redémarre donc dès que `homeassistant/` a bougé. C'est plus long
d'une minute, et ça ne rate jamais.

**Pourquoi « depuis la dernière version appliquée ».** Un `git pull` sans
redémarrage, puis un second `git pull`, répond `Already up to date`, alors
que rien n'est en place. Le script note dans `/config/.casa-appliquee` la
version qu'il a vu redémarrer, et compare à elle, pas au dernier `pull`.

---

## À la main, sans les scripts

### Sur le Pi

```bash
git -C /config/casa-domotique pull
```

Puis, **si `pi/configuration.yaml` a changé** :

```bash
cp /config/casa-domotique/pi/configuration.yaml /config/configuration.yaml
```

Puis **Outils de développement → YAML → Vérifier la configuration**, et
**Paramètres → Système → Redémarrer**.

### L'app, depuis le portable

C'est la manœuvre de [TESTING.md 2.6](TESTING.md#26-lapp-servie-par-home-assistant),
en quatre temps et sur deux machines — c'est pour elle que le script existe :

1. **sur le portable** : `cd app && npm run build`, avec `app/.env` qui vise
   le Pi (`VITE_HA_URL=http://192.168.1.142`, sans port) ;
2. **sur le portable** : servir `app/dist` en archive, et ouvrir le pare-feu
   au Pi seul — `sudo ufw allow from 192.168.1.142 to any port 8765 proto tcp` ;
3. **sur le Pi** : télécharger l'archive, **puis seulement** effacer
   l'ancienne app et déballer la nouvelle ;
4. **sur le portable** : refermer le port.

L'ordre du troisième temps compte : effacer `/config/www/casa/assets` avant
d'avoir la nouvelle archive laisse une page noire, dont les scripts
répondent 404, jusqu'au prochain déploiement réussi.

---

## Pannes

Toutes ont été rencontrées pour de vrai le 11 septembre 2026.

**La page de l'app reste noire.** Son `index.html` charge des fichiers
`assets/…` qui n'existent plus : l'ancienne app a été effacée, la nouvelle
jamais déposée. Relancer `dev/deployer-app.sh`.

**Les nouveaux réglages n'apparaissent pas** (« Réglages du lever : absents
du Pi » dans l'app). Home Assistant n'a pas redémarré depuis le `pull`.
Relancer `mettre-a-jour-pi.sh` : il le verra et le proposera.

**`sudo: command not found`.** La commande a été tapée sur le Pi, alors
qu'elle était pour le portable : le terminal du Pi n'a ni `sudo` ni pare-feu
à ouvrir. Chaque commande de cette page dit sur quelle machine elle se tape.

**`curl: (7) Failed to connect … Could not connect to server`**, sur le Pi.
Le portable ne sert rien, ou son pare-feu refuse le Pi. Avec
`dev/deployer-app.sh`, la ligne ne se colle qu'une fois le script lancé et
arrivé à « En attente du Pi ».

**`ModuleNotFoundError: No module named 'yaml'`**, en lançant
`dev/verifier.py` sur le Pi. Ce vérificateur est un outil du portable, il
n'a pas sa place sur le Pi. Sur le portable, il vise ce que dit
`app/.env`, donc le Pi.

**Le renommage d'une lampe répond « Entity with this ID is already
registered »,** ou réussit sous `light.chambre_1`. Une fiche orpheline garde
le nom : [TESTING.md 3.1](TESTING.md#31-passer-à-la-vraie-configuration).

**L'intégration Music Assistant ne démarre pas** après avoir été recréée à la
main avec une adresse : [TESTING.md 2.3](TESTING.md#23-les-modules-complémentaires).
