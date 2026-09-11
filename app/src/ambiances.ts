// Les ambiances telles que l'app les montre : celles du dépôt (MOODS, dans
// config.ts), puis celles ajoutées depuis l'app, une par place remplie
// (packages/ambiances.yaml). Les tuiles, « Je suis debout » et « Enregistrer
// les lumières » lisent tous cette liste-ci : une ambiance ajoutée apparaît
// partout à la fois, et disparaît partout à la fois.
import type { HassEntities } from "home-assistant-js-websocket";
import { MOODS, PERSO_PLACES, VOLUME_MAX } from "./config";
import { useMaison } from "./maison";
import { usePlaylists } from "./bibliotheque";

// Le JSON d'une place remplie : le nom, la teinte de la tuile, la musique
// (comme un réglage d'ambiance — "" ou « aucune » n'y touche pas), et le
// volume en %, 0 pour ne pas y toucher.
export type Perso = { n: string; c: string; m: string; v: number };

// Une place : son script, son texte, et l'identifiant de sa scène.
export type Place = { n: number; id: string; texte: string; scene: string };

export type Ambiance = {
  id: string;
  label: string;
  what: string;
  hue: string;
  wide?: boolean;
  // L'identifiant de configuration de la scène (le `id:` de scenes.yaml),
  // jamais un entity_id : Home Assistant tire ce dernier du nom.
  scene?: string;
  // Les ambiances du dépôt : le réglage de la musique, ce qu'elle joue quand
  // il est vide, le réglage du volume et le volume quand il est à 0.
  musique?: string;
  defaut?: string;
  volume?: string;
  volumeDefaut?: number;
  // Les ambiances ajoutées : leur place, et ce qu'elle contient.
  perso?: Place & { reglage: Perso };
};

export const PLACES: Place[] = Array.from({ length: PERSO_PLACES }, (_, i) => ({
  n: i + 1,
  id: `script.mood_perso_${i + 1}`,
  texte: `input_text.ambiance_perso_${i + 1}`,
  scene: `ambiance_perso_${i + 1}`,
}));

// Les teintes proposées pour une tuile : celles des ambiances d'origine, et
// de quoi s'en distinguer.
export const TEINTES = ["#e8b86d", "#d9774a", "#c9a227", "#7fae5a", "#3c9d9b", "#4a88c7", "#7a6fd0", "#b0455f", "#d42c5e"];

// Court : le nom tient sur une tuile, et partage 255 caractères avec la
// musique, dont un lien Spotify prend déjà le tiers.
export const NOM_MAX = 24;

export function lirePerso(brut: string | undefined): Perso | null {
  if (!brut || !brut.trim().startsWith("{")) return null;
  try {
    const o = JSON.parse(brut) as Record<string, unknown>;
    const n = typeof o.n === "string" ? o.n.trim() : "";
    if (!n) return null;
    const c = typeof o.c === "string" && /^#[0-9a-f]{6}$/i.test(o.c) ? o.c : TEINTES[0];
    const m = typeof o.m === "string" ? o.m.trim() : "";
    const v = Number(o.v);
    return { n, c, m, v: Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0 };
  } catch {
    return null;
  }
}

export const ecrirePerso = (p: Perso) => JSON.stringify({ n: p.n, c: p.c, m: p.m, v: p.v });

export const sansMusique = (m: string) => m === "" || m.toLowerCase() === "aucune";

// Toutes les ambiances, dans l'ordre de la grille : celles du dépôt, les
// ajoutées, puis « Tout éteindre », l'interrupteur général, en bas.
export function listeAmbiances(entities: HassEntities, nomDe: (valeur: string) => string = (v) => v): Ambiance[] {
  const fixes: Ambiance[] = MOODS.map((m) => ({ ...m }));
  const persos: Ambiance[] = PLACES.flatMap((p) => {
    const reglage = lirePerso(entities[p.texte]?.state);
    if (!reglage) return [];
    const musique = sansMusique(reglage.m) ? "sans musique" : nomDe(reglage.m);
    return [{
      id: p.id,
      label: reglage.n,
      hue: reglage.c,
      scene: p.scene,
      what: `${musique} · ${reglage.v ? `son ${reglage.v} %` : "son inchangé"}`,
      perso: { ...p, reglage },
    }];
  });
  return [...fixes.filter((a) => !a.wide), ...persos, ...fixes.filter((a) => a.wide)];
}

// La même liste, avec le nom affiché des playlists dans la ligne des tuiles.
export function useAmbiances(): Ambiance[] {
  const { entities } = useMaison();
  const { playlists } = usePlaylists();
  return listeAmbiances(entities, (v) => playlists.find((p) => p.valeur === v)?.nom ?? v);
}

// La première place libre, ou null si les six sont prises — ou si le Pi ne
// les a pas encore (packages/ambiances.yaml pas tiré, ou pas redémarré).
export function placeLibre(entities: HassEntities): Place | null {
  return PLACES.find((p) => entities[p.texte] && !lirePerso(entities[p.texte].state)) ?? null;
}

export const placesPresentes = (entities: HassEntities) => PLACES.some((p) => entities[p.texte]);

// Une scène par son identifiant de configuration : « reveil_debout » est
// scene.reveille sur le Pi, parce que la scène s'appelle « Réveillé ».
export function sceneDe(entities: HassEntities, configId: string): string | null {
  return Object.values(entities).find((e) => e.entity_id.startsWith("scene.") && e.attributes.id === configId)
    ?.entity_id ?? null;
}

// Le plafond de la WiiM en % (packages/son.yaml) : 0, ou absent, c'est 100.
export function plafond(entities: HassEntities): number {
  const m = Number(entities[VOLUME_MAX]?.state);
  return m > 0 ? Math.round(m) : 100;
}

// Le volume qu'une ambiance donnera, avant plafond. null : elle n'y touche
// pas — une ajoutée réglée à 0, ou une ambiance sans volume.
export function volumeRegle(a: Ambiance, entities: HassEntities): number | null {
  if (a.perso) return a.perso.reglage.v || null;
  if (!a.volume) return null;
  const r = Number(entities[a.volume]?.state);
  return r > 0 ? Math.round(r) : a.volumeDefaut ?? null;
}
