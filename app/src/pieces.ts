// Les pièces de la maison telles que Home Assistant les range : ses zones, et
// ce qu'il y a dedans. Rien n'est listé dans l'app — depuis le déménagement de
// novembre 2026, une lampe ajoutée et rangée dans sa zone apparaît d'elle-même
// dans Pièces, comme elle répond déjà à la voix (packages/lumieres.yaml).
//
// Les zones ne sont pas dans les états : il faut lire trois registres —
// zones, appareils, entités —, parce qu'une entité hérite le plus souvent la
// zone de son appareil. Lus une fois, puis relus quand Home Assistant dit
// qu'un registre a changé : une lampe déplacée de pièce dans son interface
// change de carte ici sans recharger l'app.
import { useEffect, useState } from "react";
import type { HassEntities } from "home-assistant-js-websocket";
import { connect } from "./ha";
import { estBrosse } from "./brossage";

type Zone = { area_id: string; name: string };
type Registre = { zones: Zone[]; zoneDe: Record<string, string | null> };

export type Piece = {
  id: string; // l'area_id, « sans » pour ce qui n'a pas de zone
  nom: string;
  lumieres: string[];
  scenes: string[];
  brosses: string[];
  temperature?: string;
  humidite?: string;
};

// L'ordre de l'écran : la chambre, le salon, puis les autres par leur nom.
const EN_TETE = ["bedroom", "living_room"];

// L'anneau lumineux d'un Voice PE est une `light` rangée dans la pièce, mais
// il n'éclaire rien : ni carte, ni interrupteur, ni ambiance — même règle que
// les ordres vocaux.
export const estLampe = (id: string) => id.startsWith("light.") && !id.endsWith("_led_ring");

async function lire(): Promise<Registre> {
  const conn = await connect();
  const [zones, appareils, entites] = await Promise.all([
    conn.sendMessagePromise<Zone[]>({ type: "config/area_registry/list" }),
    conn.sendMessagePromise<{ id: string; area_id: string | null }[]>({ type: "config/device_registry/list" }),
    conn.sendMessagePromise<{
      entity_id: string; area_id: string | null; device_id: string | null;
      disabled_by: string | null; hidden_by: string | null;
    }[]>({ type: "config/entity_registry/list" }),
  ]);
  const zoneAppareil = new Map(appareils.map((d) => [d.id, d.area_id]));
  const zoneDe: Record<string, string | null> = {};
  for (const e of entites) {
    if (e.disabled_by || e.hidden_by) continue;
    zoneDe[e.entity_id] = e.area_id ?? (e.device_id ? zoneAppareil.get(e.device_id) ?? null : null);
  }
  return { zones, zoneDe };
}

// Un seul registre pour toute l'app, partagé par les écrans qui le lisent.
let courant: Registre | null = null;
let enCours: Promise<void> | null = null;
let abonne = false;
const ecouteurs = new Set<(r: Registre) => void>();

function recharger() {
  if (enCours) return enCours;
  enCours = lire()
    .then((r) => {
      courant = r;
      ecouteurs.forEach((f) => f(r));
    })
    .catch(() => {})
    .finally(() => (enCours = null));
  return enCours;
}

function abonner() {
  if (abonne) return;
  abonne = true;
  connect().then((conn) => {
    for (const ev of ["area_registry_updated", "device_registry_updated", "entity_registry_updated"]) {
      conn.subscribeEvents(() => recharger(), ev).catch(() => {});
    }
  });
}

export function useRegistre(): Registre | null {
  const [r, setR] = useState<Registre | null>(courant);
  useEffect(() => {
    ecouteurs.add(setR);
    abonner();
    if (!courant) recharger();
    return () => {
      ecouteurs.delete(setR);
    };
  }, []);
  return r;
}

// Les pièces qui ont au moins une lampe, une scène ou un thermomètre — le
// bureau, sans lampe, a sa température —, avec leur climat quand un
// capteur y est rangé. Une lampe sans zone tombe dans « Sans pièce »,
// pour ne jamais disparaître de l'écran.
export function piecesDe(reg: Registre | null, entities: HassEntities): Piece[] {
  if (!reg) return [];
  const parZone = new Map<string, Piece>();
  const piece = (id: string, nom: string) => {
    let p = parZone.get(id);
    if (!p) parZone.set(id, (p = { id, nom, lumieres: [], scenes: [], brosses: [] }));
    return p;
  };
  const noms = new Map(reg.zones.map((z) => [z.area_id, z.name]));
  for (const id of Object.keys(entities).sort()) {
    const e = entities[id];
    if (!(id in reg.zoneDe)) continue; // désactivée, cachée, ou hors registre
    const zone = reg.zoneDe[id];
    // Une entité que plus rien ne fournit — le groupe des WiZ, retiré du
    // dépôt — reste dans le registre, restaurée, sans zone. Mais une lampe
    // RANGÉE dans une pièce et restaurée est une vraie lampe momentanément
    // injoignable — tout le Zigbee, quand ZHA ne démarre pas — : elle reste
    // à l'écran, marquée injoignable. La cacher faisait dire « aucune lampe »
    // à toutes les pièces, constaté le 17 novembre 2026.
    if (e.attributes.restored && !zone) continue;
    if (estLampe(id)) {
      // Sans pièce ET injoignable : un reste — l'ancien groupe des WiZ tant
      // que le Pi n'a pas tiré le dépôt —, pas une lampe à montrer.
      if (!zone && e.state === "unavailable") continue;
      piece(zone ?? "sans", zone ? noms.get(zone) ?? zone : "Sans pièce").lumieres.push(id);
    } else if (zone && id.startsWith("scene.")) {
      piece(zone, noms.get(zone) ?? zone).scenes.push(id);
    } else if (zone && estBrosse(entities, id)) {
      piece(zone, noms.get(zone) ?? zone).brosses.push(id);
    } else if (zone && id.startsWith("sensor.")) {
      const classe = e.attributes.device_class;
      const p = parZone.get(zone);
      if (classe === "temperature") (p ?? piece(zone, noms.get(zone) ?? zone)).temperature ??= id;
      if (classe === "humidity") (p ?? piece(zone, noms.get(zone) ?? zone)).humidite ??= id;
    }
  }
  const rang = (p: Piece) => (EN_TETE.includes(p.id) ? EN_TETE.indexOf(p.id) : p.id === "sans" ? 99 : 10);
  return [...parZone.values()]
    .filter((p) => p.lumieres.length > 0 || p.scenes.length > 0 || !!p.temperature || p.brosses.length > 0)
    .sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, "fr"));
}

export function usePieces(entities: HassEntities): Piece[] {
  return piecesDe(useRegistre(), entities);
}

// La pièce d'une lampe, pour l'édition d'une ambiance.
export const pieceDe = (pieces: Piece[], lampe: string) => pieces.find((p) => p.lumieres.includes(lampe)) ?? null;
