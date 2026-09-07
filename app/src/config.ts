// Adaptez ces entity_id à votre installation (Paramètres > Appareils et services > Entités).

// `what` est la ligne sous le nom de la tuile : ce que fait l'ambiance, en
// quelques mots. Elle décrit scenes.yaml et scripts.yaml sans les lire ;
// si une scène change, c'est ici qu'on met la phrase à jour.
export const MOODS = [
  { id: "script.mood_cinema", label: "Cinéma", what: "TV + barre · salon tamisé", hue: "#c0392b" },
  { id: "script.mood_detente", label: "Détente", what: "Salon + cuisine · 2400 K", hue: "#e8b86d" },
  { id: "script.mood_focus", label: "Focus", what: "Salon seul · 4200 K", hue: "#4a88c7" },
  { id: "script.mood_chillos", label: "Chillos", what: "Tamisé · 2200 K", hue: "#b0455f" },
  { id: "script.mood_off", label: "Tout éteindre", what: "Lumières + lecture", hue: "#5a5652", wide: true },
];

// L'enceinte de référence : celle dont l'app affiche la lecture, et le chef
// du groupe quand d'autres pièces écoutent.
export const PLAYER = "media_player.ma_salon";

// Les enceintes Music Assistant, une par pièce. Le libellé sert aux puces
// d'Écoute ; l'entité, elle, dit si la pièce existe vraiment.
export const PLAYERS = [
  { id: "media_player.ma_salon", label: "Salon" },
  { id: "media_player.ma_cuisine", label: "Cuisine" },
  { id: "media_player.ma_chambre", label: "Chambre" },
];

export const LIGHTS = ["light.salon", "light.cuisine", "light.chambre"];

// Ce que les ambiances pilotent en plus des lumières et de la musique.
export const DEVICES = [
  { id: "media_player.lg_tv", label: "TV LG · webOS" },
  { id: "media_player.sonos_beam", label: "Barre Sonos · HDMI eARC" },
];

// L'automatisation du bouton mural : présente sur le Pi une fois le
// device_id renseigné dans automations.yaml, absente en dev.
export const WALL_BUTTON = "automation.bouton_mural_cinema";

// La liste des playlists n'est pas ici : elle vit sur le Pi, dans
// input_selects.yaml, et arrive par le subscribeEntities que fait déjà ha.ts.
// En ajouter une ne demande donc pas de reconstruire l'app.
export const PLAYLIST_SELECT = "input_select.playlist";

// L'ambiance courante, écrite par chaque script mood_* en dernière étape.
// C'est cet écho qui allume le bouton, pas le clic : sans lui dans le délai,
// l'app revient en arrière en nommant le script (docs/architecture.md).
export const MOOD_SELECT = "input_select.mood";
export const ECHO_DELAI_MS = 6000;
