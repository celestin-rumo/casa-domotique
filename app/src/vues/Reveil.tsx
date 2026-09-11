import { useEffect, useState, type CSSProperties } from "react";
import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { LIGHTS, REVEIL, REVEILLE } from "../config";
import { runScript, setBoolean, setNumber, setSelect, setTime } from "../ha";
import { useTexte } from "../useTexte";
import { usePlaylists } from "../bibliotheque";
import { listeAmbiances, plafond, sceneDe } from "../ambiances";
import { Carte, Curseur, Interrupteur, NoteFaute, OptionsPlaylists } from "../ui";
import {
  css, degradeCourbe, ecrireCourbe, estBlanc, hsRgb, kelvinDe, lireCourbe, rgbDuPoint, rgbHex,
  teinteSaturationDe, type Point,
} from "../couleur";

// 255 caractères pour la courbe : une douzaine de points y tiennent large.
const MAX_POINTS = 12;

// Une lumière du lever, et le moment où elle entre, en pourcentage du lever.
// Le texte de input_text.reveil_lumieres : « light.chambre,light.chambre_wiz_1@26 »
// — la lampe dès le début, la WiZ à 26 %, puis les deux sur la même courbe.
// Sans @, dès le début. Le Pi (packages/reveil.yaml) lit le texte de la
// même façon.
type Lampe = { id: string; p: number };

// Sans réglage, le Pi lève light.chambre seule : l'app montre la même chose.
function lireLampes(brut: string): Lampe[] {
  const l: Lampe[] = [];
  for (const morceau of brut.split(",")) {
    const [id, p] = morceau.split("@").map((s) => s.trim());
    if (!id.startsWith("light.") || l.some((x) => x.id === id)) continue;
    const n = Number(p ?? 0);
    l.push({ id, p: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0 });
  }
  return l.length ? l : [{ id: "light.chambre", p: 0 }];
}

// L'ordre de Pièces, pour que le texte ne change pas selon l'ordre des clics.
function ecrireLampes(l: Lampe[]): string {
  const rang = (id: string) => (LIGHTS.includes(id) ? LIGHTS.indexOf(id) : LIGHTS.length);
  return [...l]
    .sort((a, b) => rang(a.id) - rang(b.id))
    .map((x) => (x.p > 0 ? `${x.id}@${x.p}` : x.id))
    .join(",");
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
    : enCours ? `le jour se lève${niveau ? ` · ${niveau}` : ""}`
    : on ? `${hhmm} · lever en ${minutes} min · ${quoi}`
    : "désactivé";

  // Les fautes des gestes de cette carte ; celles des réglages s'affichent
  // dans Réglages, là où on les a faits.
  const ici = [REVEIL.actif, REVEIL.heure, REVEIL.duree, REVEIL.script, REVEIL.stop];
  const entiteFautive = ici.find((id) => fautes[id]) ?? REVEIL.script;
  const faute = fautes[entiteFautive];

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
        <button className="adv-toggle" onClick={() => choisirOnglet("reglages", "reglages-reveil")}>
          <span>Lumières, courbe, musique · Réglages</span>
          <Chevron droite />
        </button>
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

// Les réglages du lever, sur l'écran Réglages : une carte par question —
// quelles lumières et sur quelle courbe, quelle musique, et ce que fait
// « Je suis debout ».
export function ReglagesReveil() {
  const { entities, fautes } = useMaison();
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

  return (
    <>
      {entiteFautive && (
        <Carte faute>
          <NoteFaute entite={entiteFautive} message={fautes[entiteFautive]} />
        </Carte>
      )}
      <Carte>
        <Lampes lampes={lampes} points={points} onChange={changerLampes} />
        <Courbe points={points} onChange={changerCourbe} />
      </Carte>
      <Carte>
        <Musique minutes={minutes} />
      </Carte>
      <Carte>
        <AuLever />
      </Carte>
    </>
  );
}

// Les lumières qui se lèvent. Au moins une : la dernière cochée ne se
// décoche pas, sinon le Pi retomberait sur light.chambre sans qu'on l'ait
// choisi.
//
// Chacune entre à un moment de la courbe : le début, ou l'un de ses points.
// Une lampe qui entre s'allume en fondu, depuis le noir, jusqu'à là où en est
// la courbe, puis suit la même montée que les autres.
function Lampes({ lampes, points, onChange }: { lampes: Lampe[]; points: Point[]; onChange: (l: Lampe[]) => void }) {
  const { entities } = useMaison();
  const nom = (id: string) => entities[id]?.attributes.friendly_name ?? id;
  // Pas la fin : une lampe qui n'entrerait qu'à la fin ne se lèverait pas.
  const moments = points.slice(0, -1).map((pt, j) => ({
    p: j === 0 ? 0 : Math.round(pt.p),
    label: j === 0 ? "dès le début" : `au point ${j} · ${Math.round(pt.p)} %`,
  }));
  const echelonne = lampes.length > 1 || lampes.some((l) => l.p > 0);
  return (
    <div className="sous">
      <p className="sous-titre">Les lumières du lever</p>
      <div className="chips">
        {LIGHTS.map((id) => {
          const dedans = lampes.some((l) => l.id === id);
          const seule = dedans && lampes.length === 1;
          return (
            <button
              key={id}
              className="chip"
              aria-pressed={dedans}
              disabled={seule}
              title={seule ? "il faut au moins une lumière" : undefined}
              onClick={() => onChange(dedans ? lampes.filter((l) => l.id !== id) : [...lampes, { id, p: 0 }])}
            >
              {nom(id)}
            </button>
          );
        })}
      </div>
      {echelonne && (
        <>
          <p className="row-meta">Chacune entre à son moment, puis toutes suivent la même courbe.</p>
          {lampes.map((l) => (
            <label className="entree" key={l.id}>
              <span>{nom(l.id)}</span>
              <select
                value={l.p}
                onChange={(e) => onChange(lampes.map((x) => (x.id === l.id ? { ...x, p: Number(e.target.value) } : x)))}
              >
                {moments.map((m) => <option key={m.p} value={m.p}>{m.label}</option>)}
                {/* Un moment qui ne tombe plus sur un point — le point a été
                    retiré — reste visible plutôt que de sauter au début. */}
                {!moments.some((m) => m.p === l.p) && <option value={l.p}>à {l.p} %</option>}
              </select>
            </label>
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
      <div className="courbe" aria-hidden="true" style={{ background: degradeCourbe(points) }}>
        {points.map((pt, j) => <i key={j} style={{ left: `${pt.p}%` }} />)}
      </div>
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
      <p className="sous-titre">La musique du réveil</p>
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
function AuLever() {
  const { entities, agir } = useMaison();
  const select = entities[REVEIL.debout];
  const choix = select?.state ?? "rien";
  const connues: string[] = select?.attributes.options ?? [];
  const options = [
    { id: "rien", label: "Laisser la pièce comme le lever l'a mise" },
    { id: REVEILLE.id, label: `Allumer l'éclairage « ${REVEILLE.label} »` },
    ...listeAmbiances(entities).filter((a) => a.scene).map((a) => ({ id: a.id, label: `Lancer ${a.label}` })),
  ].filter((o) => connues.length === 0 || connues.includes(o.id));
  const perdue = !options.some((o) => o.id === choix);
  // Par son identifiant : la scène « Réveillé » est scene.reveille sur le Pi.
  const sansScene = choix === REVEILLE.id && !sceneDe(entities, REVEILLE.scene);
  return (
    <div className="sous">
      <p className="sous-titre">« Je suis debout »</p>
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
