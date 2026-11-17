// Les séances de brossage d'une brosse Oral-B, reconstruites depuis
// l'historique de Home Assistant (homeassistant/packages/brossage.yaml dit
// pourquoi : l'intégration oralb ne donne ni liste de séances ni score).
//
// Ce que la brosse publie pendant une séance, constaté le 17 novembre 2026
// sur IO Series EB08 :
//   sensor.<brosse>          running … puis post_brushing_statistics
//   sensor.<brosse>_duree    la durée en secondes, mise à jour en continu
//   sensor.<brosse>_secteur  sector_1 … sector_4, puis no_sector
//   sensor.<brosse>_pression normal, et high à chaque appui trop fort
// Une séance est donc un passage à `running`, jusqu'à l'état suivant.
import { useEffect, useState } from "react";
import type { HassEntities } from "home-assistant-js-websocket";
import { connect } from "./ha";

export type Seance = {
  debut: Date;
  duree: number; // secondes
  secteurs: number; // secteurs atteints
  secteursTotal: number;
  pressions: number; // appuis trop forts
  score: number; // 0–100
};

// Les deux minutes que recommandent les dentistes, et que la brosse
// elle-même découpe en quatre secteurs de trente secondes.
export const CIBLE_S = 120;

// LE SCORE, calculé ici et nulle part ailleurs : la brosse n'en donne pas.
// Sur 100 :
//   - 60 pour la durée, au prorata jusqu'à deux minutes ;
//   - 20 pour les secteurs atteints, sur ceux que la brosse annonce ;
//   - 20 pour la pression, moins 2 par appui trop fort (dix appuis : zéro).
// La durée pèse le plus parce que c'est elle qui manque d'ordinaire ; les
// secteurs disent si la bouche a été faite en entier ; la pression, si les
// gencives ont été ménagées.
export function score(duree: number, secteurs: number, secteursTotal: number, pressions: number): number {
  const d = 60 * Math.min(duree / CIBLE_S, 1);
  const s = 20 * (secteursTotal > 0 ? Math.min(secteurs / secteursTotal, 1) : 0);
  const p = Math.max(0, 20 - 2 * pressions);
  return Math.round(d + s + p);
}

// Une brosse : un capteur d'état accompagné de sa durée et de son secteur.
export function estBrosse(entities: HassEntities, id: string): boolean {
  return id.startsWith("sensor.") && !!entities[`${id}_duree`] && !!entities[`${id}_secteur`];
}

type Point = { s: string; t: number };
type Reponse = Record<string, { s: string; lu?: number; lc?: number }[]>;

async function historique(brosse: string, jours: number): Promise<Record<string, Point[]>> {
  const conn = await connect();
  const ids = [brosse, `${brosse}_duree`, `${brosse}_secteur`, `${brosse}_pression`];
  const r = await conn.sendMessagePromise<Reponse>({
    type: "history/history_during_period",
    start_time: new Date(Date.now() - jours * 86_400_000).toISOString(),
    entity_ids: ids,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
  const points: Record<string, Point[]> = {};
  for (const id of ids) {
    points[id] = (r[id] ?? []).map((p) => ({ s: p.s, t: (p.lu ?? p.lc ?? 0) * 1000 }));
  }
  return points;
}

export function seancesDe(brosse: string, points: Record<string, Point[]>, secteursTotal: number): Seance[] {
  const etats = points[brosse] ?? [];
  const seances: Seance[] = [];
  for (let i = 0; i < etats.length; i++) {
    if (etats[i].s !== "running") continue;
    const debut = etats[i].t;
    // La fin : l'état suivant, ou maintenant si la séance est en cours. Une
    // marge de cinq secondes, la dernière durée pouvant arriver juste après.
    const fin = (etats[i + 1]?.t ?? Date.now()) + 5000;
    const dans = (id: string) => (points[id] ?? []).filter((p) => p.t >= debut && p.t <= fin);
    const duree = Math.max(0, ...dans(`${brosse}_duree`).map((p) => Number(p.s)).filter(Number.isFinite));
    const secteurs = new Set(dans(`${brosse}_secteur`).map((p) => p.s).filter((s) => /^sector_\d+$/.test(s))).size;
    const pressions = dans(`${brosse}_pression`).filter((p) => p.s === "high").length;
    // Un allumage de quelques secondes n'est pas un brossage.
    if (duree < 10) continue;
    seances.push({
      debut: new Date(debut), duree, secteurs, secteursTotal, pressions,
      score: score(duree, secteurs, secteursTotal, pressions),
    });
  }
  return seances.reverse(); // la plus récente d'abord
}

// Les séances d'une brosse, relues à la fin de chaque brossage : le passage
// à post_brushing_statistics les déclenche.
export function useSeances(entities: HassEntities, brosse: string, jours = 90) {
  const etat = entities[brosse]?.state;
  const total = Number(entities[`${brosse}_nombre_de_secteurs`]?.state) || 4;
  const [seances, setSeances] = useState<Seance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const finie = etat === "running" ? "en cours" : "fini";
  useEffect(() => {
    let vivant = true;
    historique(brosse, jours)
      .then((p) => vivant && setSeances(seancesDe(brosse, p, total)))
      .catch((e) => vivant && setErreur(String(e?.message ?? e)));
    return () => {
      vivant = false;
    };
  }, [brosse, jours, total, finie]);
  return { seances, erreur };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
