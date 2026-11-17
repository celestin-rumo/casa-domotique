// La bibliothèque de playlists de Music Assistant, et les épingles qu'on y a
// choisies. La bibliothèque est lue une seule fois par session : elle ne
// change pas pendant qu'on regarde l'app, et Music Assistant met une seconde
// à la rendre. Les épingles, elles, vivent sur le Pi
// (input_text.playlists_epinglees, packages/playlists.yaml) : épingler sur le
// natel les montre aussi sur le portable, et au réveil.
import { useEffect, useState } from "react";
import { bibliotheque, messageDe, type PlaylistBib } from "./ha";
import { useMaison } from "./maison";
import { PLAYLIST_SELECT, PLAYLISTS_ADRESSES, PLAYLISTS_EPINGLEES, PLAYLISTS_NOMS, PLAYLISTS_SPOTIFY } from "./config";
import type { HassEntities } from "home-assistant-js-websocket";

let toute: Promise<PlaylistBib[]> | null = null;

function chargerBibliotheque(): Promise<PlaylistBib[]> {
  if (!toute) {
    toute = bibliotheque();
    // Un échec ne reste pas en mémoire : la prochaine ouverture réessaie.
    toute.catch(() => (toute = null));
  }
  return toute;
}

// `actif` à false ne charge rien : pas de demande à Music Assistant tant
// qu'on n'ouvre pas la recherche et qu'aucune playlist n'est épinglée.
export function useBibliotheque(actif: boolean) {
  const [items, setItems] = useState<PlaylistBib[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    chargerBibliotheque()
      .then((i) => vivant && setItems(i))
      .catch((e) => vivant && setErreur(messageDe(e)));
    return () => {
      vivant = false;
    };
  }, [actif]);
  return { items, erreur };
}

export const numeroDe = (uri: string) => /^library:\/\/playlist\/(\d+)$/.exec(uri)?.[1] ?? null;
export const uriDe = (numero: string) => `library://playlist/${numero}`;

export function lireEpingles(brut: string | undefined): string[] {
  return (brut ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
}

export type Epingle = { numero: string; uri: string; name: string };

// Les épingles avec leur nom. Une épingle dont la playlist a disparu de la
// bibliothèque le dit, plutôt que de disparaître elle aussi.
export function useEpingles() {
  const { entities } = useMaison();
  const numeros = lireEpingles(entities[PLAYLISTS_EPINGLEES]?.state);
  const { items, erreur } = useBibliotheque(numeros.length > 0);
  const noms = new Map((items ?? []).map((p) => [numeroDe(p.uri), p.name]));
  const epingles: Epingle[] = numeros.map((numero) => ({
    numero,
    uri: uriDe(numero),
    name: noms.get(numero) ?? (items ? `playlist n° ${numero} · introuvable` : `playlist n° ${numero}`),
  }));
  return { epingles, erreur };
}

// --- Les noms donnés depuis l'app ---
//
// input_text.playlists_noms (packages/playlists.yaml) : des « clé=Nom »
// séparés par des points-virgules. La clé est le numéro d'une épinglée, ou le
// nom d'une playlist de la table. Seul l'affichage change : les scripts
// jouent toujours la même adresse, et un réglage garde la même valeur.
export function lireNoms(brut: string | undefined): Map<string, string> {
  const noms = new Map<string, string>();
  for (const morceau of (brut ?? "").split(";")) {
    const i = morceau.indexOf("=");
    if (i <= 0) continue;
    const cle = morceau.slice(0, i).trim();
    const nom = morceau.slice(i + 1).trim();
    if (cle && nom) noms.set(cle, nom);
  }
  return noms;
}

export function ecrireNoms(noms: Map<string, string>): string {
  return [...noms].map(([cle, nom]) => `${cle}=${nom}`).join(";");
}

// Ni « ; » ni « = », qui découperaient le texte ; et court, parce que tous
// les noms partagent 255 caractères.
export const nettoyerNom = (s: string) => s.replace(/[;=]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

export type Playlist = {
  cle: string; // ce qui porte le nom : le nom de la table, ou le numéro de l'épinglée
  valeur: string; // ce que script.play_playlist reçoit, et ce qu'un réglage retient
  origine: string; // le nom d'origine
  nom: string; // le nom affiché : celui donné dans l'app, sinon l'origine
  epinglee: boolean;
  // Ajoutée par son lien Spotify : `cle` est alors son identifiant.
  spotify?: boolean;
  image?: string | null;
  // Un nom de la table réassigné depuis Écoute : ce qu'il joue désormais, par
  // son nom dans la bibliothèque, et la valeur écrite (un numéro, d'ordinaire).
  // Absents, il joue l'adresse de scripts.yaml.
  joue?: string;
  adresse?: string;
};

// --- Ce que joue un nom de la table ---
//
// input_text.playlists_adresses (packages/playlists.yaml), au même format que
// les noms : « Chillos=83;Focus=spotify:playlist:… ». Le numéro d'une
// playlist de la bibliothèque, ou une adresse tapée dans Home Assistant.
// script.play_playlist le préfère à la table : les ambiances, le réveil et la
// voix suivent donc le nom, sans qu'on touche à leurs réglages.
export const lireAdresses = lireNoms;
export const ecrireAdresses = ecrireNoms;

// Un numéro ou une adresse, sous le nom qu'il a dans la bibliothèque quand
// elle le connaît.
export function nomDansBibliotheque(valeur: string, items: PlaylistBib[] | null): string {
  const uri = /^\d+$/.test(valeur) ? uriDe(valeur) : valeur;
  const trouvee = items?.find((p) => p.uri === uri);
  if (trouvee) return trouvee.name;
  const numero = numeroDe(uri);
  return numero ? `playlist n° ${numero}` : valeur;
}

// Toutes les playlists que l'app propose — la table, puis les épinglées —,
// sous leur nom affiché. Écoute, le réveil et l'édition d'une ambiance lisent
// la même liste : une playlist renommée l'est partout à la fois.
export function usePlaylists() {
  const { entities } = useMaison();
  const { epingles, erreur } = useEpingles();
  const noms = lireNoms(entities[PLAYLISTS_NOMS]?.state);
  const adresses = lireAdresses(entities[PLAYLISTS_ADRESSES]?.state);
  // La bibliothèque n'est demandée que si un nom a été réassigné : c'est
  // elle qui dit ce que « 83 » joue.
  const { items } = useBibliotheque(adresses.size > 0);
  const table: string[] = entities[PLAYLIST_SELECT]?.attributes.options ?? [];
  const spotify = lireSpotify(entities);
  const infos = useInfosSpotify(spotify);
  const playlists: Playlist[] = [
    ...table.map((n) => {
      const a = adresses.get(n);
      return {
        cle: n, valeur: n, origine: n, nom: noms.get(n) ?? n, epinglee: false,
        ...(a ? { joue: nomDansBibliotheque(a, items), adresse: a } : {}),
      };
    }),
    ...epingles.map((p) => ({
      cle: p.numero, valeur: p.uri, origine: p.name, nom: noms.get(p.numero) ?? p.name, epinglee: true,
    })),
    ...spotify.map((id) => {
      const o = infos[id];
      const origine = o?.titre ?? "Playlist Spotify";
      return {
        cle: id, valeur: uriSpotify(id), origine, nom: noms.get(id) ?? origine, epinglee: true,
        spotify: true, image: o?.image ?? null,
      };
    }),
  ];
  return { playlists, erreur };
}

// --- Les playlists Spotify ajoutées par leur lien ---
//
// Leurs identifiants vivent sur le Pi, répartis sur trois input_text
// (packages/playlists.yaml) ; leur nom et leur pochette, chez Spotify, qui
// les donne à n'importe quelle page par son service oEmbed (CORS ouvert,
// vérifié le 17 novembre 2026). Gardés en mémoire et dans le stockage du
// natel : la liste ne clignote pas à chaque ouverture.

// Un lien de partage, une adresse « spotify:playlist:… », ou l'identifiant
// seul. Le ?si= d'un lien copié est ignoré : c'est un jeton lié au compte.
export function idSpotify(texte: string): string | null {
  const t = texte.trim();
  const m = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/|spotify:playlist:)([A-Za-z0-9]{22})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9]{22}$/.test(t) ? t : null;
}

export const uriSpotify = (id: string) => `spotify:playlist:${id}`;

export function lireSpotify(entities: HassEntities): string[] {
  const ids = PLAYLISTS_SPOTIFY.flatMap((e) => (entities[e]?.state ?? "").split(","))
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9]{22}$/.test(s));
  return [...new Set(ids)];
}

// La liste répartie sur les réglages, chacun sous 255 caractères. null : elle
// ne tient plus.
export function repartirSpotify(ids: string[]): string[] | null {
  const textes = PLAYLISTS_SPOTIFY.map(() => "");
  let i = 0;
  for (const id of ids) {
    while (i < textes.length && (textes[i] ? textes[i].length + 1 : 0) + id.length > 255) i++;
    if (i >= textes.length) return null;
    textes[i] = textes[i] ? `${textes[i]},${id}` : id;
  }
  return textes;
}

type InfoSpotify = { titre: string; image: string | null };
const CLE_SPOTIFY = "casa.spotify.noms";
const memoire: Record<string, InfoSpotify> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CLE_SPOTIFY) ?? "{}") as Record<string, InfoSpotify>;
  } catch {
    return {};
  }
})();
const enVol = new Map<string, Promise<void>>();

// Ce qu'on sait déjà d'une playlist Spotify, sans rien demander.
export const infoConnue = (id: string): InfoSpotify | undefined => memoire[id];

export function infoSpotify(id: string): Promise<void> {
  if (memoire[id] || enVol.has(id)) return enVol.get(id) ?? Promise.resolve();
  const p = fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/playlist/${id}`)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Spotify répond ${r.status}`))))
    .then((o: { title?: string; thumbnail_url?: string }) => {
      memoire[id] = { titre: o.title?.trim() || "Playlist Spotify", image: o.thumbnail_url ?? null };
      try {
        localStorage.setItem(CLE_SPOTIFY, JSON.stringify(memoire));
      } catch { /* tant pis */ }
    })
    .finally(() => enVol.delete(id));
  enVol.set(id, p);
  return p;
}

function useInfosSpotify(ids: string[]): Record<string, InfoSpotify> {
  const [, rafraichir] = useState(0);
  const cle = ids.join(",");
  useEffect(() => {
    let vivant = true;
    for (const id of cle ? cle.split(",") : []) {
      if (!memoire[id]) infoSpotify(id).then(() => vivant && rafraichir((n) => n + 1), () => {});
    }
    return () => {
      vivant = false;
    };
  }, [cle]);
  return memoire;
}
