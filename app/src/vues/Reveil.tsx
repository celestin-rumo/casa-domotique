import { useEffect, useState, type CSSProperties } from "react";
import { useMaison } from "../maison";
import { APRES_REVEIL, LIGHTS, PLAYLIST_SELECT, REVEIL } from "../config";
import { runScript, setBoolean, setNumber, setSelect, setTime } from "../ha";
import { useTexte } from "../useTexte";
import { useEpingles } from "../bibliotheque";
import { Carte, Curseur, Interrupteur, NoteFaute } from "../ui";
import {
  css, degradeCourbe, ecrireCourbe, estBlanc, hsRgb, kelvinDe, lireCourbe, rgbDuPoint, rgbHex,
  teinteSaturationDe, type Point,
} from "../couleur";

// 255 caractères pour la courbe : une douzaine de points y tiennent large.
const MAX_POINTS = 12;

// Sans réglage, le Pi lève light.chambre seule : l'app montre la même chose.
function lireLampes(brut: string): string[] {
  const l = brut.split(",").map((s) => s.trim()).filter((s) => s.startsWith("light."));
  return l.length ? l : ["light.chambre"];
}

const Chevron = () => (
  <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

// La carte du réveil, sur l'écran Ambiances. En haut, ce qu'on touche chaque
// soir : l'heure, actif ou non, la durée, et l'aperçu du lever. Dessous,
// replié, ce qu'on règle une fois : les lumières, la courbe, la musique, et
// ce que fait « Je suis debout ». Tout vit sur le Pi, dans les helpers de
// packages/reveil.yaml : c'est le Pi qui réveille, pas le natel.
export function Reveil() {
  const { entities, fautes, agir } = useMaison();
  const heure = entities[REVEIL.heure];
  const actif = entities[REVEIL.actif];
  const duree = entities[REVEIL.duree];
  const script = entities[REVEIL.script];

  const [lumieresBrut, ecrireLumieres] = useTexte(REVEIL.lumieres);
  const [courbeBrut, ecrireCourbeBrut] = useTexte(REVEIL.courbe);
  const lampes = lireLampes(lumieresBrut);
  const points = lireCourbe(courbeBrut);

  const present = !!(heure && actif && duree && script);
  // Un Pi qui n'a pas encore tiré la version du 11 septembre 2026 a le
  // réveil, mais pas ses nouveaux réglages : on le dit plutôt que d'ouvrir un
  // panneau dont chaque geste échouerait.
  const reglable = present && !!entities[REVEIL.courbe];
  const on = actif?.state === "on";
  const enCours = script?.state === "on";
  const hhmm = (heure?.state ?? "07:00:00").slice(0, 5);
  const minutes = Number(duree?.state ?? 20);

  // Comme le curseur : la valeur tapée reste affichée jusqu'à l'écho.
  const [locale, setLocale] = useState<string | null>(null);
  useEffect(() => setLocale(null), [hhmm]);
  const [ouvert, setOuvert] = useState(false);

  const premiere = entities[lampes[0]];
  const niveau = premiere?.state === "on" && premiere.attributes.brightness
    ? `${Math.round((premiere.attributes.brightness / 255) * 100)} %`
    : "";
  const quoi = lampes.length > 1 ? `${lampes.length} lumières` : "1 lumière";
  const meta = !present ? "absent du Pi"
    : enCours ? `le jour se lève${niveau ? ` · ${niveau}` : ""}`
    : on ? `${hhmm} · lever en ${minutes} min · ${quoi}`
    : "désactivé";

  const faute = Object.values(REVEIL).map((id) => fautes[id]).find(Boolean);
  const entiteFautive = Object.values(REVEIL).find((id) => fautes[id]) ?? REVEIL.script;

  // L'ordre de Pièces, pour que le texte ne change pas selon l'ordre des clics.
  const ecrireLampes = (l: string[]) =>
    ecrireLumieres([...LIGHTS.filter((id) => l.includes(id)), ...l.filter((id) => !LIGHTS.includes(id))].join(","));

  return (
    <Carte lit={enCours} faute={!!faute}>
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
        <button className="adv-toggle" aria-expanded={ouvert} aria-controls="reveil-reglages"
                disabled={!reglable} onClick={() => setOuvert(!ouvert)}>
          <span>{reglable ? "Régler le lever" : "Réglages du lever : absents du Pi"}</span>
          {reglable && <Chevron />}
        </button>
      )}

      {ouvert && reglable && (
        <div className="adv open long" id="reveil-reglages">
          <Lampes lampes={lampes} onChange={ecrireLampes} />
          <Courbe points={points} onChange={(p) => ecrireCourbeBrut(ecrireCourbe(p))} />
          <Musique minutes={minutes} />
          <AuLever />
        </div>
      )}

      <div className="btn-row">
        {enCours ? (
          <button className="btn primary" onClick={() => agir(REVEIL.stop, () => runScript(REVEIL.stop))}>
            Je suis debout
          </button>
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

// Les lumières qui se lèvent. Au moins une : la dernière cochée ne se
// décoche pas, sinon le Pi retomberait sur light.chambre sans qu'on l'ait
// choisi.
function Lampes({ lampes, onChange }: { lampes: string[]; onChange: (l: string[]) => void }) {
  const { entities } = useMaison();
  return (
    <div className="sous">
      <p className="sous-titre">Les lumières du lever</p>
      <div className="chips">
        {LIGHTS.map((id) => {
          const dedans = lampes.includes(id);
          const seule = dedans && lampes.length === 1;
          return (
            <button
              key={id}
              className="chip"
              aria-pressed={dedans}
              disabled={seule}
              title={seule ? "il faut au moins une lumière" : undefined}
              onClick={() => onChange(dedans ? lampes.filter((l) => l !== id) : [...lampes, id])}
            >
              {entities[id]?.attributes.friendly_name ?? id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// La courbe : un début, une fin, et autant de points entre les deux qu'on
// veut. Un point ajouté se pose au milieu du plus grand écart, avec
// l'intensité à mi-chemin de ses voisins : il ne change rien au lever tant
// qu'on ne le déplace pas, ce qui permet de l'ajouter sans crainte.
function Courbe({ points, onChange }: { points: Point[]; onChange: (p: Point[]) => void }) {
  let i = 0, ecart = -1;
  for (let j = 0; j < points.length - 1; j++) {
    const e = points[j + 1].p - points[j].p;
    if (e > ecart) { ecart = e; i = j; }
  }
  const ajouter = () => {
    const a = points[i], b = points[i + 1];
    const milieu: Point = { p: Math.round((a.p + b.p) / 2), b: Math.round((a.b + b.b) / 2), c: a.c };
    onChange([...points.slice(0, i + 1), milieu, ...points.slice(i + 1)]);
  };
  return (
    <div className="sous">
      <p className="sous-titre">La courbe</p>
      {points.map((pt, j) => {
        const bord = j === 0 || j === points.length - 1;
        return (
          <PointCourbe
            key={j}
            id={`reveil-pt-${j}`}
            pt={pt}
            titre={j === 0 ? "Début" : j === points.length - 1 ? "Fin" : `Point ${j}`}
            min={bord ? undefined : points[j - 1].p + 1}
            max={bord ? undefined : points[j + 1].p - 1}
            onChange={(nouveau) => onChange(points.map((x, k) => (k === j ? nouveau : x)))}
            onRetirer={bord ? undefined : () => onChange(points.filter((_, k) => k !== j))}
          />
        );
      })}
      <button className="btn" disabled={points.length >= MAX_POINTS || ecart < 2} onClick={ajouter}>
        Ajouter un point
      </button>
    </div>
  );
}

function PointCourbe({ id, pt, titre, min, max, onChange, onRetirer }: {
  id: string;
  pt: Point;
  titre: string;
  min?: number;
  max?: number;
  onChange: (p: Point) => void;
  onRetirer?: () => void;
}) {
  const blanc = estBlanc(pt.c);
  const rgb = rgbDuPoint(pt.c);
  const [h, s] = blanc ? [30, 80] : teinteSaturationDe(rgb);
  const pouce = { "--thumb": css(rgb) } as CSSProperties;
  return (
    <div className="point" style={{ "--pt": css(rgb) } as CSSProperties}>
      <div className="point-tete">
        <span className="point-puce" aria-hidden="true" />
        <span className="point-nom">{titre}</span>
        <span className="row-meta">{Math.round(pt.p)} %</span>
        {onRetirer && <button className="lien" onClick={onRetirer}>Retirer</button>}
      </div>
      {min !== undefined && max !== undefined && max > min && (
        <Curseur id={`${id}-p`} label="Moment du lever" min={min} max={max} valeur={pt.p}
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
  );
}

// La musique : ce qu'elle joue, quand elle entre, et de quel volume à quel
// volume. Les deux volumes à 0 % veulent dire « jamais réglés » : le Pi joue
// alors de 3 % à 20 %, et l'app montre ces valeurs-là — les écrire toutes
// les deux au premier geste évite que l'autre reste à 0 sans qu'on l'ait
// voulu.
function Musique({ minutes }: { minutes: number }) {
  const { entities, agir } = useMaison();
  const [choix, ecrireChoix] = useTexte(REVEIL.playlist);
  const { epingles } = useEpingles();
  const noms: string[] = entities[PLAYLIST_SELECT]?.attributes.options ?? [];

  const valeur = choix || "Détente";
  const connue = valeur === "aucune" || noms.includes(valeur) || epingles.some((p) => p.uri === valeur);
  const muette = valeur === "aucune";

  const delai = Number(entities[REVEIL.musiqueDelai]?.state ?? 10);
  const v0 = Number(entities[REVEIL.volumeDebut]?.state ?? 0);
  const v1 = Number(entities[REVEIL.volumeFin]?.state ?? 0);
  const jamais = v0 === 0 && v1 === 0;
  const volume = (id: string, v: number) => agir(id, async () => {
    if (jamais) {
      await setNumber(REVEIL.volumeDebut, id === REVEIL.volumeDebut ? v : 3);
      await setNumber(REVEIL.volumeFin, id === REVEIL.volumeFin ? v : 20);
    } else {
      await setNumber(id, v);
    }
  });

  return (
    <div className="sous">
      <p className="sous-titre">La musique</p>
      <label className="champ">
        <span className="row-meta">Playlist</span>
        <select value={valeur} onChange={(e) => ecrireChoix(e.target.value)}>
          <optgroup label="Des ambiances">
            {noms.map((n) => <option key={n} value={n}>{n}</option>)}
          </optgroup>
          {epingles.length > 0 && (
            <optgroup label="Épinglées dans Écoute">
              {epingles.map((p) => <option key={p.uri} value={p.uri}>{p.name}</option>)}
            </optgroup>
          )}
          <option value="aucune">Pas de musique</option>
          {/* Un choix que ces listes ne connaissent plus reste visible, plutôt
              que d'afficher en silence la première option. */}
          {!connue && <option value={valeur}>{valeur}</option>}
        </select>
      </label>
      <Curseur id="reveil-mdelai" label="Entre après" min={0} max={Math.max(minutes, 1)}
               valeur={Math.min(delai, minutes)} format={(v) => `${Math.round(v)} min`} disabled={muette}
               onCommit={(v) => agir(REVEIL.musiqueDelai, () => setNumber(REVEIL.musiqueDelai, Math.round(v)))} />
      <Curseur id="reveil-v0" label="Volume au départ" min={0} max={100} valeur={jamais ? 3 : v0} disabled={muette}
               onCommit={(v) => volume(REVEIL.volumeDebut, Math.round(v))} />
      <Curseur id="reveil-v1" label="Volume à la fin du lever" min={0} max={100} valeur={jamais ? 20 : v1} disabled={muette}
               onCommit={(v) => volume(REVEIL.volumeFin, Math.round(v))} />
    </div>
  );
}

// Ce que fait « Je suis debout », une fois le lever et la musique coupés.
function AuLever() {
  const { entities, agir } = useMaison();
  const choix = entities[REVEIL.debout]?.state ?? "rien";
  const sansScene = choix === "scene.reveil_debout" && !entities["scene.reveil_debout"];
  return (
    <div className="sous">
      <p className="sous-titre">« Je suis debout »</p>
      <label className="champ">
        <span className="row-meta">Ensuite</span>
        <select value={choix} onChange={(e) => agir(REVEIL.debout, () => setSelect(REVEIL.debout, e.target.value))}>
          {APRES_REVEIL.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {sansScene && (
        <p className="row-meta">
          L'éclairage « Réveillé » n'existe pas encore : règle la pièce comme tu la veux au lever, puis
          Ambiances → Enregistrer les lumières → Réveillé. D'ici là, « Je suis debout » laisse la pièce telle quelle.
        </p>
      )}
    </div>
  );
}
