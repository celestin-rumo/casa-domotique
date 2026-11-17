import { useMaison } from "../maison";
import { CIBLE_S, mmss, useSeances, type Seance } from "../brossage";
import { Depliable } from "../ui";

const JOUR = new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "short" });
const HEURE = new Intl.DateTimeFormat("fr-CH", { hour: "2-digit", minute: "2-digit" });

// Une brosse à dents : la dernière séance en une ligne, et, dépliée,
// l'historique — la moyenne des sept derniers jours, puis chaque séance avec
// sa durée et son score (brossage.ts dit comment il se calcule).
export function Brosse({ id }: { id: string }) {
  const { entities } = useMaison();
  const { seances, erreur } = useSeances(entities, id);
  const nom = entities[id]?.attributes.friendly_name ?? id;
  const enCours = entities[id]?.state === "running";
  const derniere = seances?.[0];
  const semaine = (seances ?? []).filter((s) => Date.now() - s.debut.getTime() < 7 * 86_400_000);
  const moyenne = (f: (s: Seance) => number) =>
    semaine.length ? semaine.reduce((t, s) => t + f(s), 0) / semaine.length : 0;

  const resume = erreur ? "historique illisible"
    : enCours ? `brossage en cours · ${mmss(Number(entities[`${id}_duree`]?.state) || 0)}`
    : !seances ? "lecture de l'historique…"
    : !derniere ? "aucune séance enregistrée"
    : `dernière : ${mmss(derniere.duree)} · score ${derniere.score} · ${quand(derniere.debut)}`;

  return (
    <Depliable id={`brosse-${id}`} titre={`Brosse à dents · ${nom}`} resume={resume}>
      {erreur && <p className="fault-note">{erreur}</p>}
      {semaine.length > 0 && (
        <div className="climat brosse-moy">
          <div className="climat-val">
            <b className="tnum">{semaine.length}</b>
            <span>séances · 7 j</span>
          </div>
          <div className="climat-val">
            <b className="tnum">{mmss(moyenne((s) => s.duree))}</b>
            <span>durée moyenne</span>
          </div>
          <div className="climat-val">
            <b className="tnum">{Math.round(moyenne((s) => s.score))}</b>
            <span>score moyen</span>
          </div>
        </div>
      )}
      {seances && seances.length > 0 && (
        <ol className="seances">
          {seances.map((s, i) => {
            const nouveauJour = i === 0 || JOUR.format(seances[i - 1].debut) !== JOUR.format(s.debut);
            return (
              <li key={s.debut.getTime()}>
                {nouveauJour && <p className="seance-jour">{JOUR.format(s.debut)}</p>}
                <div className="seance">
                  <span className="tnum seance-heure">{HEURE.format(s.debut)}</span>
                  <span className="seance-barre" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, (s.duree / CIBLE_S) * 100)}%` }} className={s.duree >= CIBLE_S ? "ok" : ""} />
                  </span>
                  <span className="tnum seance-duree">{mmss(s.duree)}</span>
                  <span className={`tnum seance-score${s.score >= 80 ? " bon" : s.score < 50 ? " faible" : ""}`}>{s.score}</span>
                </div>
                <p className="row-meta seance-detail">
                  {s.secteurs}/{s.secteursTotal} secteurs · {s.pressions === 0 ? "pression juste" : `${s.pressions} appui${s.pressions > 1 ? "s" : ""} trop fort${s.pressions > 1 ? "s" : ""}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <p className="row-meta">
        Score sur 100 : durée 60 (jusqu'à 2 min), secteurs 20, pression 20 (−2 par appui trop fort). Historique gardé 90 jours.
      </p>
    </Depliable>
  );
}

function quand(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `${JOUR.format(d)} ${HEURE.format(d)}`;
}
