// La bibliothèque de playlists de Music Assistant, et les épingles qu'on y a
// choisies. La bibliothèque est lue une seule fois par session : elle ne
// change pas pendant qu'on regarde l'app, et Music Assistant met une seconde
// à la rendre. Les épingles, elles, vivent sur le Pi
// (input_text.playlists_epinglees, packages/playlists.yaml) : épingler sur le
// natel les montre aussi sur le portable, et au réveil.
import { useEffect, useState } from "react";
import { bibliotheque, messageDe, type PlaylistBib } from "./ha";
import { useMaison } from "./maison";
import { PLAYLISTS_EPINGLEES } from "./config";

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
