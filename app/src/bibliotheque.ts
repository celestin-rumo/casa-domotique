// La bibliothèque de playlists de Music Assistant, et les épingles qu'on y a
// choisies. La bibliothèque est lue une seule fois par session : elle ne
// change pas pendant qu'on regarde l'app, et Music Assistant met une seconde
// à la rendre. Les épingles, elles, vivent sur le Pi
// (input_text.playlists_epinglees, packages/playlists.yaml) : épingler sur le
// natel les montre aussi sur le portable, et au réveil.
import { useEffect, useState } from "react";
import { bibliotheque, messageDe, type PlaylistBib } from "./ha";
import { useMaison } from "./maison";
import { PLAYLIST_SELECT, PLAYLISTS_EPINGLEES, PLAYLISTS_NOMS } from "./config";

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
};

// Toutes les playlists que l'app propose — la table, puis les épinglées —,
// sous leur nom affiché. Écoute, le réveil et l'édition d'une ambiance lisent
// la même liste : une playlist renommée l'est partout à la fois.
export function usePlaylists() {
  const { entities } = useMaison();
  const { epingles, erreur } = useEpingles();
  const noms = lireNoms(entities[PLAYLISTS_NOMS]?.state);
  const table: string[] = entities[PLAYLIST_SELECT]?.attributes.options ?? [];
  const playlists: Playlist[] = [
    ...table.map((n) => ({ cle: n, valeur: n, origine: n, nom: noms.get(n) ?? n, epinglee: false })),
    ...epingles.map((p) => ({
      cle: p.numero, valeur: p.uri, origine: p.name, nom: noms.get(p.numero) ?? p.name, epinglee: true,
    })),
  ];
  return { playlists, erreur };
}
