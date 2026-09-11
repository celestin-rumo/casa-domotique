// Adaptez ces entity_id à votre installation (Paramètres > Appareils et services > Entités).

// `what` est la ligne sous le nom de la tuile : ce que fait l'ambiance, en
// quelques mots. Elle décrit scenes.yaml et scripts.yaml sans les lire ;
// si une scène change, c'est ici qu'on met la phrase à jour.
// UNE SEULE PIÈCE : LA CHAMBRE. C'est le seul endroit équipé, et l'app est
// écrite comme s'il n'y en avait pas d'autre. Les pièces supplémentaires et
// l'ambiance Cinéma reviendront avec les ampoules et la TV — la version qui
// les porte est dans l'historique git, commit ccb9f08 et avant.
//
// `scene` est l'identifiant de la scène que l'ambiance allume — le champ
// `id:` de scenes.yaml, pas l'entity_id. Il sert à l'enregistrement depuis
// l'app : c'est cette scène-là qui est réécrite dans Home Assistant.
// « Tout éteindre » n'en a pas, et n'apparaît donc pas dans la liste
// d'enregistrement : figer une pièce noire n'aurait aucun sens.
//
// `musique` est le réglage de la musique de l'ambiance
// (packages/ambiances.yaml), et `defaut` ce qu'elle joue quand ce réglage
// est vide : la variable `defaut` de son script, dans scripts.yaml, que
// l'app répète ici pour pouvoir la nommer.
export const MOODS = [
  { id: "script.mood_detente", label: "Détente", what: "Chambre · 2400 K", hue: "#e8b86d", scene: "detente",
    musique: "input_text.musique_detente", defaut: "Détente" },
  { id: "script.mood_focus", label: "Focus", what: "Chambre · 4200 K", hue: "#4a88c7", scene: "focus",
    musique: "input_text.musique_focus", defaut: "Focus" },
  { id: "script.mood_chillos", label: "Chillos", what: "Tamisé · 2200 K", hue: "#b0455f", scene: "chillos",
    musique: "input_text.musique_chillos", defaut: "Chillos" },
  { id: "script.mood_calin", label: "Câlin", what: "Rouge rosé · Chillos", hue: "#d42c5e", scene: "calin",
    musique: "input_text.musique_calin", defaut: "Chillos" },
  { id: "script.mood_off", label: "Tout éteindre", what: "Lumières + lecture", hue: "#5a5652", wide: true },
];

// L'enceinte de référence : celle dont l'app affiche la lecture. Elle était
// aussi le chef du groupe quand d'autres pièces écoutaient ; avec une seule
// enceinte, il n'y a plus de groupe, et Écoute n'affiche qu'une puce figée.
export const PLAYER = "media_player.ma_chambre";

// Les enceintes Music Assistant, une par pièce. Le libellé sert aux puces
// d'Écoute ; l'entité, elle, dit si la pièce existe vraiment.
export const PLAYERS = [
  { id: "media_player.ma_chambre", label: "Chambre" },
];

// L'ordre de l'écran Pièces : la lampe, le bandeau, puis les deux WiZ.
// Les WiZ ne savent pas les transitions — leur supported_features n'a pas
// le bit 32, là où les Hue l'ont — : elles sautent d'un réglage à l'autre
// quand les Hue fondent.
export const LIGHTS = ["light.chambre", "light.chambre_bandeau", "light.chambre_wiz_1", "light.chambre_wiz_2"];

// Le climat, en tête de l'écran Pièces : le capteur de la pièce, renommé
// ainsi sur le Pi, et la température dehors telle que MétéoSuisse la donne
// (packages/meteo.yaml).
export const CLIMAT = {
  temperature: "sensor.temperature_interieure",
  humidite: "sensor.humidite_interieure",
  exterieur: "sensor.meteosuisse",
};

// Ce que les ambiances pilotent en plus des lumières et de la musique.
// Vide tant qu'il n'y a ni TV ni barre de son : la section correspondante
// de l'écran Pièces ne s'affiche donc pas. Y remettre `media_player.lg_tv`
// et `media_player.sonos_beam` le jour où ils existent.
export const DEVICES: { id: string; label: string }[] = [];

// Le réveil (homeassistant/packages/reveil.yaml). Tous ses réglages sont des
// helpers que l'app écrit directement ; le script s'allume (state « on »)
// tant que le jour se lève, et c'est cet état qui dit « en cours ».
//
// Ce bloc ne contient QUE des entity_id : dev/verifier.py le lit avec une
// expression régulière et vérifie que chaque chaîne existe sur le Pi. Pas
// d'objet imbriqué non plus, sa lecture s'arrête à la première accolade
// fermante.
export const REVEIL = {
  heure: "input_datetime.reveil_heure",
  actif: "input_boolean.reveil_actif",
  duree: "input_number.reveil_duree",
  lumieres: "input_text.reveil_lumieres",
  courbe: "input_text.reveil_courbe",
  musiqueDelai: "input_number.reveil_musique_delai",
  volumeDebut: "input_number.reveil_volume_debut",
  volumeFin: "input_number.reveil_volume_fin",
  playlist: "input_text.reveil_playlist",
  debout: "input_select.reveil_debout",
  script: "script.reveil",
  stop: "script.reveil_stop",
};

// Ce que « Je suis debout » peut faire de la pièce : les options de
// input_select.reveil_debout, dans le même ordre, avec un nom lisible.
export const APRES_REVEIL = [
  { id: "rien", label: "Laisser la pièce comme le lever l'a mise" },
  { id: "scene.reveil_debout", label: "Allumer l'éclairage « Réveillé »" },
  ...MOODS.flatMap((m) => (m.scene ? [{ id: m.id, label: `Lancer ${m.label}` }] : [])),
];

// Les scènes que « Enregistrer les lumières » peut réécrire : celles des
// ambiances, plus l'éclairage « Réveillé » que « Je suis debout » allume.
export const CIBLES_ENREGISTREMENT = [
  ...MOODS.flatMap((m) => (m.scene ? [{ id: m.id, label: m.label, scene: m.scene }] : [])),
  { id: "scene.reveil_debout", label: "Réveillé", scene: "reveil_debout" },
];

// Les playlists épinglées depuis Écoute (homeassistant/packages/playlists.yaml).
export const PLAYLISTS_EPINGLEES = "input_text.playlists_epinglees";

// Ce que l'enceinte joue, tel que script.play_playlist l'a lancé : un nom de
// la table ou une adresse. L'enceinte ne dit que le morceau, jamais la
// playlist — c'est cet écho qui dit à Écoute quelle ligne allumer.
export const PLAYLIST_COURANTE = "input_text.playlist_courante";

// Les noms donnés aux playlists depuis Écoute : « 30=Soirée;Détente=Le soir ».
export const PLAYLISTS_NOMS = "input_text.playlists_noms";

// La liste des playlists n'est pas ici : elle vit sur le Pi, dans
// input_selects.yaml, et arrive par le subscribeEntities que fait déjà ha.ts.
// En ajouter une ne demande donc pas de reconstruire l'app.
export const PLAYLIST_SELECT = "input_select.playlist";

// L'ambiance courante, écrite par chaque script mood_* en dernière étape.
// C'est cet écho qui allume le bouton, pas le clic : sans lui dans le délai,
// l'app revient en arrière en nommant le script (docs/architecture.md).
export const MOOD_SELECT = "input_select.mood";
export const ECHO_DELAI_MS = 6000;
