// Adaptez ces entity_id à votre installation (Paramètres > Appareils et services > Entités).
export const MOODS = [
  { id: "script.mood_cinema", label: "Cinéma", hue: "#c0392b" },
  { id: "script.mood_detente", label: "Détente", hue: "#e8b86d" },
  { id: "script.mood_focus", label: "Focus", hue: "#4a88c7" },
  { id: "script.mood_chillos", label: "Chillos", hue: "#b0455f" },
  { id: "script.mood_off", label: "Tout éteindre", hue: "#5a5652" },
];

export const PLAYER = "media_player.ma_salon";

export const LIGHTS = ["light.salon", "light.cuisine", "light.chambre"];

// La liste des playlists n'est pas ici : elle vit sur le Pi, dans
// input_selects.yaml, et arrive par le subscribeEntities que fait déjà ha.ts.
// En ajouter une ne demande donc pas de reconstruire l'app.
export const PLAYLIST_SELECT = "input_select.playlist";
