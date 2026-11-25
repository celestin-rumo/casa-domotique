import { useEffect, useState, type CSSProperties } from "react";
import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { REVEIL, REVEILLE } from "../config";
import { usePieces, type Piece } from "../pieces";
import { runScript, setBoolean, setNumber, setSelect, setTime } from "../ha";
import { useTexte } from "../useTexte";
import { usePlaylists } from "../bibliotheque";
import { listeAmbiances, plafond, sceneDe } from "../ambiances";
import { Carte, Curseur, Depliable, Interrupteur, NoteFaute, OptionsPlaylists } from "../ui";
import type { HassEntities } from "home-assistant-js-websocket";
import {
  css, degradeCourbe, ecrireCourbe, estBlanc, hsRgb, kelvinDe, lireCourbe, rgbDuPoint, rgbHex,
  teinteSaturationDe, type Point,
} from "../couleur";

// 255 caractères pour la courbe : une douzaine de points y tiennent large.
const MAX_POINTS = 12;

// Une lumière du lever, le moment où elle entre, en pourcentage du lever, et
// son intensité maximale. Le texte de input_text.reveil_lumieres :
// « light.chambre,light.chambre_bandeau@26,zone:couloir@50*40 » — la lampe
// dès le début, le bandeau à 26 %, tout le couloir à mi-lever et à 40 % de la
// courbe. Sans @, dès le début ; sans *, 100 %. `zone:` est une pièce
// entière, dont le Pi prend les lampes au moment du lever. Le Pi
// (packages/reveil.yaml) lit le texte de la même façon.
export type Lampe = { id: string; p: number; f: number };

// Le lever et le coucher partagent leurs éditeurs ; seuls les mots et le
// sens d'un moment changent — celui où une lampe entre, ou celui où elle
// s'éteint.
export type Sens = "lever" | "coucher";

const borne = (n: number, min: number, max: number, defaut: number) =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : defaut;

// Sans réglage, le Pi lève light.chambre seule : l'app montre la même chose.
// Le coucher, lui, prend alors les lampes allumées : `defaut` vide.
export function lireLampes(brut: string, defaut: Lampe[] = [{ id: "light.chambre", p: 0, f: 100 }]): Lampe[] {
  const l: Lampe[] = [];
  for (const morceau of brut.split(",")) {
    const [avant, f] = morceau.split("*").map((s) => s.trim());
    const [id, p] = avant.split("@").map((s) => s.trim());
    if (!(id.startsWith("light.") || id.startsWith("zone:")) || l.some((x) => x.id === id)) continue;
    l.push({ id, p: borne(Number(p ?? 0), 0, 100, 0), f: borne(Number(f ?? 100), 1, 100, 100) });
  }
  return l.length ? l : defaut;
}

// Triées, pour que le texte ne change pas selon l'ordre des clics.
export function ecrireLampes(l: Lampe[]): string {
  return [...l]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((x) => `${x.id}${x.p > 0 ? `@${x.p}` : ""}${x.f < 100 ? `*${x.f}` : ""}`)
    .join(",");
}

// Le nom d'une lumière du lever : celui de la lampe, ou « Couloir (toute la
// pièce) ».
export function nomLampe(id: string, entities: HassEntities, pieces: Piece[]): string {
  if (id.startsWith("zone:")) {
    const z = id.slice(5);
    return `${pieces.find((p) => p.id === z)?.nom ?? z} (toute la pièce)`;
  }
  return entities[id]?.attributes.friendly_name ?? id;
}

const Chevron = ({ droite }: { droite?: boolean }) => (
  <svg className={`chev${droite ? " droite" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

// La carte du réveil, sur l'écran Ambiances : ce qu'on touche chaque soir —
// l'heure, actif ou non, la durée, et l'aperçu du lever. Ce qu'on règle une
// fois — les lumières, la courbe, la musique, et ce que fait « Je suis
// debout » — prenait tout l'écran une fois déplié : il vit dans Réglages
// (ReglagesReveil, plus bas), où cette carte mène. Tout vit sur le Pi, dans
// les helpers de packages/reveil.yaml : c'est le Pi qui réveille, pas le
// natel.
export function Reveil() {
  const { entities, fautes, agir } = useMaison();
  const { choisirOnglet } = useNavigation();
  const heure = entities[REVEIL.heure];
  const actif = entities[REVEIL.actif];
  const duree = entities[REVEIL.duree];
  const script = entities[REVEIL.script];

  const [lumieresBrut] = useTexte(REVEIL.lumieres);
  const [courbeBrut] = useTexte(REVEIL.courbe);
  const lampes = lireLampes(lumieresBrut);
  const points = lireCourbe(courbeBrut);

  const present = !!(heure && actif && duree && script);
  const on = actif?.state === "on";
  const enCours = script?.state === "on";

  // Le bonjour : attendu tant que son minuteur tourne, à l'heure qu'il dit.
  // Dit depuis moins d'une heure, il peut encore être repoussé — sauf si
  // « Je suis debout » l'a annulé : même règle que script.reveil_prolonger.
  const bonjour = entities[REVEIL.bonjour];
  const attendu = bonjour?.state === "active";
  const finit = attendu && bonjour?.attributes.finishes_at ? new Date(bonjour.attributes.finishes_at) : null;
  const change = bonjour ? Date.parse(bonjour.last_changed) : 0;
  const debout = Date.parse(entities[REVEIL.stop]?.attributes.last_triggered ?? "") || 0;
  const dit = !!bonjour && !attendu && Date.now() - change < 3_600_000 && change - debout > 60_000;
  const reveille = enCours || attendu || dit;
  const prolongeable = !!entities[REVEIL.prolonger];
  const hhmm = (heure?.state ?? "07:00:00").slice(0, 5);
  const minutes = Number(duree?.state ?? 20);

  // Comme le curseur : la valeur tapée reste affichée jusqu'à l'écho.
  const [locale, setLocale] = useState<string | null>(null);
  useEffect(() => setLocale(null), [hhmm]);

  const premiere = entities[lampes[0].id];
  const niveau = premiere?.state === "on" && premiere.attributes.brightness
    ? `${Math.round((premiere.attributes.brightness / 255) * 100)} %`
    : "";
  const quoi = lampes.length > 1 ? `${lampes.length} lumières` : "1 lumière";
  const meta = !present ? "absent du Pi"
    : finit && !enCours ? `bonjour à ${finit.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}`
    : enCours ? `le jour se lève${niveau ? ` · ${niveau}` : ""}${finit ? ` · bonjour à ${finit.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
    : dit ? "bonjour dit · encore quelques minutes ?"
    : on ? `${hhmm} · lever en ${minutes} min · ${quoi}`
    : "désactivé";

  // Les fautes des gestes de cette carte ; celles des réglages s'affichent
  // dans Réglages, là où on les a faits.
  const ici = [REVEIL.actif, REVEIL.heure, REVEIL.duree, REVEIL.script, REVEIL.stop, REVEIL.prolonger];
  const entiteFautive = ici.find((id) => fautes[id]) ?? REVEIL.script;
  const faute = fautes[entiteFautive];

  return (
    <Carte lit={reveille} faute={!!faute}>
      <div className="row">
        <div>
          <div className="row-name">Réveil</div>
          <div className="row-meta">{meta}</div>
        </div>
        <Interrupteur
          on={on}
          label="Réveil actif"
          disabled={!present}
          onClick={() => agir(REVEIL.actif, () => setBoolean(REVEIL.actif, !on))}
        />
      </div>

      <NoteFaute entite={entiteFautive} message={faute ?? (present ? undefined : "packages/reveil.yaml n'est pas chargé")} />

      <div className="row">
        <label htmlFor="reveil-heure" className="row-meta">Sonne à</label>
        <input
          id="reveil-heure"
          type="time"
          value={locale ?? hhmm}
          disabled={!present}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setLocale(v);
            agir(REVEIL.heure, () => setTime(REVEIL.heure, v));
          }}
        />
      </div>

      <Curseur
        id="reveil-duree"
        label="Durée du lever"
        min={1}
        max={60}
        valeur={minutes}
        format={(v) => `${Math.round(v)} min`}
        disabled={!present}
        onCommit={(v) => agir(REVEIL.duree, () => setNumber(REVEIL.duree, Math.round(v)))}
      />

      <div className="courbe" role="img" aria-label={`Le lever : ${points.length} points, de ${points[0].b} % à ${points[points.length - 1].b} %`}
           style={{ background: degradeCourbe(points) }}>
        {points.map((pt, i) => <i key={i} style={{ left: `${pt.p}%` }} />)}
      </div>

      {present && (
        <button className="adv-toggle" onClick={() => choisirOnglet("reglages", "reglages-reveil")}>
          <span>Lumières, courbe, musique · Réglages</span>
          <Chevron droite />
        </button>
      )}

      <div className="btn-row">
        {reveille ? (
          <>
            <button className="btn primary" onClick={() => agir(REVEIL.stop, () => runScript(REVEIL.stop))}>
              Je suis debout
            </button>
            {/* Le bonjour recule ; la lumière et la musique restent où elles
                en sont. Déjà dit, il revient dans ces minutes-là. */}
            {prolongeable && [5, 10].map((n) => (
              <button key={n} className="btn"
                      onClick={() => agir(REVEIL.prolonger, () => runScript(REVEIL.prolonger, { minutes: n }))}>
                +{n} min
              </button>
            ))}
          </>
        ) : (
          // Une minute, pas vingt : la courbe entière en accéléré, musique
          // comprise, au même moment relatif que le matin.
          <button className="btn" disabled={!present} onClick={() => agir(REVEIL.script, () => runScript(REVEIL.script, { duree: 1 }))}>
            Essai d'une minute
          </button>
        )}
      </div>
    </Carte>
  );
}

// Les réglages du lever, sur l'écran Réglages : une carte repliée par
// question — quelles lumières, quelle courbe, quelle musique, et ce que fait
// « Je suis debout » —, chacune avec la réponse actuelle en résumé.
export function ReglagesReveil() {
  const { entities, fautes } = useMaison();
  const pieces = usePieces(entities);
  const { playlists } = usePlaylists();
  const [lumieresBrut, ecrireLumieres] = useTexte(REVEIL.lumieres);
  const [courbeBrut, ecrireCourbeBrut] = useTexte(REVEIL.courbe);
  const lampes = lireLampes(lumieresBrut);
  const points = lireCourbe(courbeBrut);

  const present = !!(entities[REVEIL.heure] && entities[REVEIL.script]);
  // Un Pi qui n'a pas encore tiré la version du 11 septembre 2026 a le
  // réveil, mais pas ses nouveaux réglages : on le dit plutôt que d'ouvrir un
  // panneau dont chaque geste échouerait.
  const reglable = present && !!entities[REVEIL.courbe];
  const minutes = Number(entities[REVEIL.duree]?.state ?? 20);

  const reglages = [REVEIL.lumieres, REVEIL.courbe, REVEIL.playlist, REVEIL.musiqueDelai,
                    REVEIL.volumeDebut, REVEIL.volumeFin, REVEIL.debout];
  const entiteFautive = reglages.find((id) => fautes[id]);

  const changerLampes = (l: Lampe[]) => ecrireLumieres(ecrireLampes(l));

  // Un point déplacé emmène les lampes qui entraient avec lui : « la seconde
  // lampe au point 1 » reste vrai quand on déplace le point 1.
  const changerCourbe = (nouveaux: Point[]) => {
    if (nouveaux.length === points.length) {
      const bouge = new Map<number, number>();
      points.forEach((pt, i) => {
        if (pt.p !== nouveaux[i].p) bouge.set(Math.round(pt.p), Math.round(nouveaux[i].p));
      });
      if (lampes.some((l) => l.p > 0 && bouge.has(l.p))) {
        changerLampes(lampes.map((l) => (l.p > 0 && bouge.has(l.p) ? { ...l, p: bouge.get(l.p)! } : l)));
      }
    }
    ecrireCourbeBrut(ecrireCourbe(nouveaux));
  };

  if (!present) {
    return (
      <Carte faute>
        <p className="row-meta">packages/reveil.yaml n'est pas chargé sur le Pi.</p>
      </Carte>
    );
  }
  if (!reglable) {
    return (
      <Carte>
        <p className="row-meta">
          Réglages du lever : absents du Pi. Home Assistant n'a pas redémarré depuis le git pull (docs/MISE-A-JOUR.md).
        </p>
      </Carte>
    );
  }

  // Les résumés : ce que chaque carte contient, lisible sans l'ouvrir.
  const nom = (id: string) => entities[id]?.attributes.friendly_name ?? id;
  const fin = points[points.length - 1];
  const brutPlaylist = entities[REVEIL.playlist]?.state;
  const playlist = !brutPlaylist || brutPlaylist === "unknown" || brutPlaylist === "unavailable" ? "Détente" : brutPlaylist;
  const v0 = Number(entities[REVEIL.volumeDebut]?.state ?? 0);
  const v1 = Number(entities[REVEIL.volumeFin]?.state ?? 0);
  const cap = plafond(entities);
  const [d0, d1] = v0 === 0 && v1 === 0 ? [3, 20] : [v0, v1];
  const resumeMusique = playlist === "aucune" ? "pas de musique"
    : `${playlists.find((p) => p.valeur === playlist)?.nom ?? playlist} · après ${Math.round(Number(entities[REVEIL.musiqueDelai]?.state ?? 10))} min · ${Math.min(d0, cap)} à ${Math.min(d1, cap)} %`;
  const choix = entities[REVEIL.debout]?.state ?? "rien";
  const resumeDebout = optionsApresReveil(entities).find((o) => o.id === choix)?.label ?? "une ambiance supprimée";

  return (
    <>
      {entiteFautive && (
        <Carte faute>
          <NoteFaute entite={entiteFautive} message={fautes[entiteFautive]} />
        </Carte>
      )}
      <Depliable id="reveil-lampes" titre="Les lumières du lever" resume={lampes.map((l) => nomLampe(l.id, entities, pieces)).join(", ")}>
        <Lampes sens="lever" lampes={lampes} points={points} onChange={changerLampes} />
      </Depliable>
      <Depliable id="reveil-courbe" titre="La courbe"
                 resume={`${points.length} points · de ${Math.round(points[0].b)} % à ${Math.round(fin.b)} %`}>
        <Courbe sens="lever" points={points} onChange={changerCourbe} />
      </Depliable>
      <Depliable id="reveil-musique" titre="La musique du réveil" resume={resumeMusique}>
        <Musique minutes={minutes} />
      </Depliable>
      <Depliable id="reveil-debout" titre="« Je suis debout »" resume={resumeDebout}>
        <AuLever />
      </Depliable>
    </>
  );
}

// Les lumières qui se lèvent, rangées par pièce : chaque lampe, ou la pièce
// entière d'un coup (« zone: », dont le Pi prend les lampes au moment du
// lever — une lampe ajoutée plus tard à la pièce suit). Au moins une au
// lever : la dernière cochée ne se décoche pas, sinon le Pi retomberait sur
// light.chambre sans qu'on l'ait choisi.
//
// Chacune a deux réglages fins :
//   - son MOMENT : le début, ou l'un des points de la courbe. Une lampe qui
//     entre s'allume en fondu, depuis le noir, jusqu'à là où en est la
//     courbe, puis suit la même montée que les autres ;
//   - son INTENSITÉ MAXIMALE : une fraction de la courbe, pour que le couloir
//     ou le salon accompagnent la chambre sans l'éblouir.
//
// Au coucher, le moment est celui où la lampe s'éteint, 0 voulant dire
// « jusqu'à la fin » ; et aucune lampe cochée est permis : le Pi prend alors
// celles qui sont allumées.
const FRACTIONS = [100, 80, 60, 40, 25, 10];

export function Lampes({ sens, lampes, points, onChange }: {
  sens: Sens;
  lampes: Lampe[];
  points: Point[];
  onChange: (l: Lampe[]) => void;
}) {
  const { entities } = useMaison();
  const pieces = usePieces(entities).filter((p) => p.lumieres.length > 0);
  const nom = (id: string) => nomLampe(id, entities, pieces);
  const lever = sens === "lever";
  // Pas la fin : une lampe qui n'entrerait qu'à la fin ne se lèverait pas,
  // et une qui s'éteindrait à la fin, c'est « jusqu'à la fin ».
  const moments = points.slice(0, -1).map((pt, j) => ({
    p: j === 0 ? 0 : Math.round(pt.p),
    label: j === 0 ? (lever ? "dès le début" : "jusqu'à la fin")
      : `${lever ? "au" : "s'éteint au"} point ${j} · ${Math.round(pt.p)} %`,
  }));
  const basculer = (id: string) => {
    const dedans = lampes.some((l) => l.id === id);
    if (dedans) {
      if (lever && lampes.length === 1) return;
      onChange(lampes.filter((l) => l.id !== id));
    } else onChange([...lampes, { id, p: 0, f: 100 }]);
  };
  const regler = (id: string, r: Partial<Lampe>) => onChange(lampes.map((x) => (x.id === id ? { ...x, ...r } : x)));
  const puce = (id: string, texte: string) => {
    const dedans = lampes.some((l) => l.id === id);
    const seule = lever && dedans && lampes.length === 1;
    return (
      <button key={id} className="chip" aria-pressed={dedans} disabled={seule}
              title={seule ? "il faut au moins une lumière" : undefined} onClick={() => basculer(id)}>
        {texte}
      </button>
    );
  };
  // Une lampe que plus aucune pièce ne montre — renommée, retirée — reste
  // décochable plutôt que de rester invisible dans le texte.
  const connues = new Set(pieces.flatMap((p) => [`zone:${p.id}`, ...p.lumieres]));
  const orphelines = lampes.filter((l) => !connues.has(l.id));
  return (
    <div className="sous">
      {pieces.map((p) => {
        const entiere = lampes.some((l) => l.id === `zone:${p.id}`);
        return (
          <div key={p.id}>
            <p className="row-meta">{p.nom}</p>
            <div className="chips">
              {p.id !== "sans" && puce(`zone:${p.id}`, p.lumieres.length > 1 ? "Toute la pièce" : "La pièce")}
              {!entiere && p.lumieres.map((id) => puce(id, entities[id]?.attributes.friendly_name ?? id))}
            </div>
          </div>
        );
      })}
      {orphelines.length > 0 && <div className="chips">{orphelines.map((l) => puce(l.id, nom(l.id)))}</div>}
      {!lever && lampes.length === 0 && (
        <p className="row-meta">Aucune choisie : celles qui sont allumées au moment du coucher, jusqu'à la fin.</p>
      )}
      {lampes.length > 0 && (
        <>
          <p className="row-meta">
            {lever ? "Chacune entre à son moment, puis toutes suivent la même courbe, chacune jusqu'à son intensité."
              : "Toutes suivent la même courbe, chacune à son intensité ; chacune s'éteint à son moment."}
          </p>
          {lampes.map((l) => (
            <div className="sous" key={l.id}>
              <label className="entree">
                <span>{nom(l.id)}</span>
                <select value={l.p} onChange={(e) => regler(l.id, { p: Number(e.target.value) })}>
                  {moments.map((m) => <option key={m.p} value={m.p}>{m.label}</option>)}
                  {/* Un moment qui ne tombe plus sur un point — le point a été
                      retiré — reste visible plutôt que de sauter au début. */}
                  {!moments.some((m) => m.p === l.p) && <option value={l.p}>à {l.p} %</option>}
                </select>
              </label>
              <label className="entree">
                <span className="row-meta">intensité</span>
                <select value={l.f} onChange={(e) => regler(l.id, { f: Number(e.target.value) })}>
                  {FRACTIONS.map((f) => <option key={f} value={f}>{f === 100 ? "toute la courbe" : `${f} % de la courbe`}</option>)}
                  {!FRACTIONS.includes(l.f) && <option value={l.f}>{l.f} % de la courbe</option>}
                </select>
              </label>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// La courbe : un début, une fin, et autant de points entre les deux qu'on
// veut. Un point ajouté se pose au milieu du plus grand écart, avec
// l'intensité à mi-chemin de ses voisins : il ne change rien au lever tant
// qu'on ne le déplace pas, ce qui permet de l'ajouter sans crainte.
//
// UN SEUL POINT DÉPLIÉ À LA FOIS. Quatre curseurs par point, douze points au
// plus : tout déplié, c'était des écrans de ronds à défiler, et le doigt qui
// défilait en déplaçait un au passage. Replié, chaque point tient sur une
// ligne qui dit où il est, à quelle intensité, de quelle couleur ; la barre
// du haut ouvre le point dont on touche le rond.
export function Courbe({ sens, points, onChange }: { sens: Sens; points: Point[]; onChange: (p: Point[]) => void }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  let i = 0, ecart = -1;
  for (let j = 0; j < points.length - 1; j++) {
    const e = points[j + 1].p - points[j].p;
    if (e > ecart) { ecart = e; i = j; }
  }
  const ajouter = () => {
    const a = points[i], b = points[i + 1];
    const milieu: Point = { p: Math.round((a.p + b.p) / 2), b: Math.round((a.b + b.b) / 2), c: a.c };
    onChange([...points.slice(0, i + 1), milieu, ...points.slice(i + 1)]);
    setOuvert(i + 1); // le point neuf s'ouvre : c'est lui qu'on va régler
  };
  const titre = (j: number) => (j === 0 ? "Début" : j === points.length - 1 ? "Fin" : `Point ${j}`);
  const basculer = (j: number) => setOuvert(ouvert === j ? null : j);
  return (
    <div className="sous">
      <div className="courbe choix" style={{ background: degradeCourbe(points) }}>
        {points.map((pt, j) => (
          <button
            key={j}
            className="courbe-pt"
            style={{ left: `${pt.p}%` }}
            aria-pressed={ouvert === j}
            aria-label={`Régler ${titre(j)}, à ${Math.round(pt.p)} % du ${sens}`}
            onClick={() => basculer(j)}
          />
        ))}
      </div>
      {points.map((pt, j) => {
        const bord = j === 0 || j === points.length - 1;
        return (
          <PointCourbe
            key={j}
            id={`${sens}-pt-${j}`}
            sens={sens}
            pt={pt}
            titre={titre(j)}
            ouvert={ouvert === j}
            surBasculer={() => basculer(j)}
            min={bord ? undefined : points[j - 1].p + 1}
            max={bord ? undefined : points[j + 1].p - 1}
            onChange={(nouveau) => onChange(points.map((x, k) => (k === j ? nouveau : x)))}
            onRetirer={bord ? undefined : () => {
              setOuvert(null);
              onChange(points.filter((_, k) => k !== j));
            }}
          />
        );
      })}
      <button className="btn" disabled={points.length >= MAX_POINTS || ecart < 2} onClick={ajouter}>
        Ajouter un point
      </button>
    </div>
  );
}

function PointCourbe({ id, sens, pt, titre, ouvert, surBasculer, min, max, onChange, onRetirer }: {
  id: string;
  sens: Sens;
  pt: Point;
  titre: string;
  ouvert: boolean;
  surBasculer: () => void;
  min?: number;
  max?: number;
  onChange: (p: Point) => void;
  onRetirer?: () => void;
}) {
  const blanc = estBlanc(pt.c);
  const rgb = rgbDuPoint(pt.c);
  const [h, s] = blanc ? [30, 80] : teinteSaturationDe(rgb);
  const pouce = { "--thumb": css(rgb) } as CSSProperties;
  const couleur = blanc ? `${kelvinDe(pt.c)} K` : "couleur";
  return (
    <div className={`point${ouvert ? " ouvert" : ""}`} style={{ "--pt": css(rgb) } as CSSProperties}>
      <div className="point-tete">
        <button className="point-bascule" aria-expanded={ouvert} aria-controls={`${id}-corps`} onClick={surBasculer}>
          <span className="point-puce" aria-hidden="true" />
          <span className="point-nom">{titre}</span>
          <span className="row-meta">à {Math.round(pt.p)} % · {Math.round(pt.b)} % · {couleur}</span>
          <Chevron />
        </button>
        {/* Seulement déplié : replié, la ligne entière sert à l'ouvrir, et un
            « Retirer » à côté se toucherait par mégarde. */}
        {ouvert && onRetirer && <button className="lien" onClick={onRetirer}>Retirer</button>}
      </div>
      {ouvert && (
      <div className="point-corps" id={`${id}-corps`}>
      {min !== undefined && max !== undefined && max > min && (
        <Curseur id={`${id}-p`} label={`Moment du ${sens}`} min={min} max={max} valeur={pt.p}
                 onCommit={(v) => onChange({ ...pt, p: Math.round(v) })} />
      )}
      <Curseur id={`${id}-b`} label="Intensité" min={0} max={100} valeur={pt.b} style={pouce}
               onCommit={(v) => onChange({ ...pt, b: Math.round(v) })} />
      <div className="seg" role="tablist" aria-label="Couleur">
        <button className="seg-b" role="tab" aria-selected={blanc}
                onClick={() => !blanc && onChange({ ...pt, c: "k2700" })}>Blanc</button>
        <button className="seg-b" role="tab" aria-selected={!blanc}
                onClick={() => blanc && onChange({ ...pt, c: rgbHex(hsRgb(h, s)) })}>Couleur</button>
      </div>
      {blanc ? (
        <Curseur id={`${id}-k`} label="Blanc" className="k-range" min={2000} max={6500} step={50}
                 valeur={kelvinDe(pt.c)} format={(v) => `${Math.round(v)} K`} style={pouce}
                 onCommit={(v) => onChange({ ...pt, c: `k${Math.round(v)}` })} />
      ) : (
        <>
          <Curseur id={`${id}-h`} label="Teinte" className="h-range" min={0} max={360} valeur={h}
                   format={(v) => `${Math.round(v)}°`} style={pouce}
                   onCommit={(v) => onChange({ ...pt, c: rgbHex(hsRgb(v, s)) })} />
          <Curseur id={`${id}-s`} label="Saturation" min={10} max={100} valeur={Math.max(10, s)} style={pouce}
                   onCommit={(v) => onChange({ ...pt, c: rgbHex(hsRgb(h, v)) })} />
        </>
      )}
      </div>
      )}
    </div>
  );
}

// La musique : ce qu'elle joue, quand elle entre, et de quel volume à quel
// volume. Les deux volumes à 0 % veulent dire « jamais réglés » : le Pi joue
// alors de 3 % à 20 %, et l'app montre ces valeurs-là — les écrire toutes
// les deux au premier geste évite que l'autre reste à 0 sans qu'on l'ait
// voulu. Le plafond de la WiiM (Réglages → Son) borne les deux curseurs :
// le Pi ne dépasserait pas, de toute façon.
function Musique({ minutes }: { minutes: number }) {
  const { entities, agir } = useMaison();
  const [choix, ecrireChoix] = useTexte(REVEIL.playlist);
  const { playlists } = usePlaylists();
  const cap = plafond(entities);

  const valeur = choix || "Détente";
  const connue = valeur === "aucune" || playlists.some((p) => p.valeur === valeur);
  const muette = valeur === "aucune";

  const delai = Number(entities[REVEIL.musiqueDelai]?.state ?? 10);
  const v0 = Number(entities[REVEIL.volumeDebut]?.state ?? 0);
  const v1 = Number(entities[REVEIL.volumeFin]?.state ?? 0);
  const jamais = v0 === 0 && v1 === 0;
  const volume = (id: string, v: number) => agir(id, async () => {
    if (jamais) {
      await setNumber(REVEIL.volumeDebut, id === REVEIL.volumeDebut ? v : Math.min(3, cap));
      await setNumber(REVEIL.volumeFin, id === REVEIL.volumeFin ? v : Math.min(20, cap));
    } else {
      await setNumber(id, v);
    }
  });

  return (
    <div className="sous">
      <label className="champ">
        <span className="row-meta">Playlist</span>
        <select value={valeur} onChange={(e) => ecrireChoix(e.target.value)}>
          <OptionsPlaylists playlists={playlists} />
          <option value="aucune">Pas de musique</option>
          {/* Un choix que ces listes ne connaissent plus reste visible, plutôt
              que d'afficher en silence la première option. */}
          {!connue && <option value={valeur}>{valeur}</option>}
        </select>
      </label>
      <Curseur id="reveil-mdelai" label="Entre après" min={0} max={Math.max(minutes, 1)}
               valeur={Math.min(delai, minutes)} format={(v) => `${Math.round(v)} min`} disabled={muette}
               onCommit={(v) => agir(REVEIL.musiqueDelai, () => setNumber(REVEIL.musiqueDelai, Math.round(v)))} />
      <Curseur id="reveil-v0" label="Volume au départ" min={0} max={cap}
               valeur={Math.min(cap, jamais ? 3 : v0)} disabled={muette}
               onCommit={(v) => volume(REVEIL.volumeDebut, Math.round(v))} />
      <Curseur id="reveil-v1" label="Volume à la fin du lever" min={0} max={cap}
               valeur={Math.min(cap, jamais ? 20 : v1)} disabled={muette}
               onCommit={(v) => volume(REVEIL.volumeFin, Math.round(v))} />
      {cap < 100 && <p className="row-meta">plafond de la WiiM : {cap} % · Réglages → Son</p>}
    </div>
  );
}

// Ce que fait « Je suis debout », une fois le lever et la musique coupés :
// rien, l'éclairage « Réveillé », ou une ambiance — ajoutées comprises. Seules
// les options que le Pi connaît sont proposées : un Pi pas encore à jour
// refuserait les autres.
function optionsApresReveil(entities: HassEntities) {
  const connues: string[] = entities[REVEIL.debout]?.attributes.options ?? [];
  return [
    { id: "rien", label: "Laisser la pièce comme le lever l'a mise" },
    { id: REVEILLE.id, label: `Allumer l'éclairage « ${REVEILLE.label} »` },
    ...listeAmbiances(entities).filter((a) => a.scene).map((a) => ({ id: a.id, label: `Lancer ${a.label}` })),
  ].filter((o) => connues.length === 0 || connues.includes(o.id));
}

function AuLever() {
  const { entities, agir } = useMaison();
  const choix = entities[REVEIL.debout]?.state ?? "rien";
  const options = optionsApresReveil(entities);
  const perdue = !options.some((o) => o.id === choix);
  // Par son identifiant : la scène « Réveillé » est scene.reveille sur le Pi.
  const sansScene = choix === REVEILLE.id && !sceneDe(entities, REVEILLE.scene);
  return (
    <div className="sous">
      <label className="champ">
        <span className="row-meta">Ensuite</span>
        <select value={choix} onChange={(e) => agir(REVEIL.debout, () => setSelect(REVEIL.debout, e.target.value))}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          {/* Une ambiance ajoutée puis supprimée : le Pi la garde choisie, et
              « Je suis debout » ne ferait rien. On le montre. */}
          {perdue && <option value={choix}>{choix.startsWith("script.mood_perso_") ? "une ambiance supprimée" : choix}</option>}
        </select>
      </label>
      {sansScene && (
        <p className="row-meta">
          L'éclairage « Réveillé » n'existe pas encore : règle la pièce comme tu la veux au lever, puis
          Enregistrer les lumières → Réveillé, plus bas sur cet écran. D'ici là, « Je suis debout » laisse la pièce telle quelle.
        </p>
      )}
      {perdue && choix.startsWith("script.mood_perso_") && (
        <p className="row-meta">Cette ambiance n'existe plus : « Je suis debout » laisserait la pièce telle quelle. Choisis autre chose.</p>
      )}
    </div>
  );
}
