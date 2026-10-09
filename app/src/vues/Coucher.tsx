import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { CLIMAT, COUCHER, SEUILS } from "../config";
import { runScript, setNumber } from "../ha";
import { useTexte } from "../useTexte";
import { usePlaylists } from "../bibliotheque";
import { plafond } from "../ambiances";
import { Carte, Curseur, Depliable, NoteFaute, OptionsPlaylists } from "../ui";
import { COUCHER_DEFAUT, degradeCourbe, ecrireCourbe, lireCourbe, type Point } from "../couleur";
import { Courbe, Lampes, ecrireLampes, lireLampes, type Lampe } from "./Reveil";

const heureDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

// Le coucher de soleil, sur l'écran Ambiances, sous le réveil : la durée,
// l'aperçu de la courbe, et de quoi le lancer ou l'arrêter. Ce qu'on règle
// une fois — les lumières, la courbe, la musique, les seuils de la chambre —
// vit dans Réglages, comme pour le lever. Tout est sur le Pi
// (packages/reveil.yaml) : « bonne nuit » fait la même chose que le bouton.
export function Coucher() {
  const { entities, fautes, agir } = useMaison();
  const { choisirOnglet } = useNavigation();
  const script = entities[COUCHER.script];
  const duree = entities[COUCHER.duree];
  const [courbeBrut] = useTexte(COUCHER.courbe);
  const [lumieresBrut] = useTexte(COUCHER.lumieres);
  const points = lireCourbe(courbeBrut, COUCHER_DEFAUT);
  const lampes = lireLampes(lumieresBrut, []);

  const present = !!(script && duree);
  const enCours = script?.state === "on";
  const minutes = Number(duree?.state ?? 20);
  const timer = entities[COUCHER.fin];
  const fin = enCours && timer?.state === "active" && timer.attributes.finishes_at
    ? heureDe(timer.attributes.finishes_at) : null;
  const quoi = lampes.length === 0 ? "les lampes allumées"
    : lampes.length > 1 ? `${lampes.length} lumières` : "1 lumière";
  const meta = !present ? "absent du Pi — Home Assistant n'a pas redémarré depuis le git pull"
    : enCours ? `la lumière baisse${fin ? ` · nuit à ${fin}` : ""}`
    : `${minutes} min · ${quoi}`;

  const ici = [COUCHER.duree, COUCHER.script, COUCHER.stop];
  const entiteFautive = ici.find((id) => fautes[id]) ?? COUCHER.script;

  return (
    <Carte lit={enCours} faute={!!fautes[entiteFautive]}>
      <div className="row">
        <div>
          <div className="row-name">Coucher de soleil</div>
          <div className="row-meta">{meta}</div>
        </div>
      </div>
      <NoteFaute entite={entiteFautive} message={fautes[entiteFautive]} />

      <Curseur
        id="coucher-duree"
        label="Durée du coucher"
        min={1}
        max={90}
        valeur={minutes}
        format={(v) => `${Math.round(v)} min`}
        disabled={!present}
        onCommit={(v) => agir(COUCHER.duree, () => setNumber(COUCHER.duree, Math.round(v)))}
      />

      <div className="courbe" role="img" aria-label={`Le coucher : ${points.length} points, de ${points[0].b} % à ${points[points.length - 1].b} %`}
           style={{ background: degradeCourbe(points) }}>
        {points.map((pt, i) => <i key={i} style={{ left: `${pt.p}%` }} />)}
      </div>

      {present && (
        <button className="adv-toggle" onClick={() => choisirOnglet("reglages", "reglages-coucher")}>
          <span>Lumières, courbe, musique · Réglages</span>
          <svg className="chev droite" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}

      <div className="btn-row">
        {enCours ? (
          <button className="btn" onClick={() => agir(COUCHER.stop, () => runScript(COUCHER.stop))}>
            Arrêter le coucher
          </button>
        ) : (
          <>
            <button className="btn primary" disabled={!present}
                    onClick={() => agir(COUCHER.script, () => runScript(COUCHER.script))}>
              Bonne nuit
            </button>
            {/* Comme pour le lever : la courbe entière en une minute, sans
                l'alerte de la chambre, pour voir ce que la nuit donnera. */}
            <button className="btn" disabled={!present}
                    onClick={() => agir(COUCHER.script, () => runScript(COUCHER.script, { duree: 1, alerte: false }))}>
              Essai d'une minute
            </button>
          </>
        )}
      </div>
    </Carte>
  );
}

// Les réglages du coucher, sur l'écran Réglages, comme ceux du lever : une
// carte repliée par question.
export function ReglagesCoucher() {
  const { entities, fautes } = useMaison();
  const { playlists } = usePlaylists();
  const [lumieresBrut, ecrireLumieres] = useTexte(COUCHER.lumieres);
  const [courbeBrut, ecrireCourbeBrut] = useTexte(COUCHER.courbe);
  const lampes = lireLampes(lumieresBrut, []);
  const points = lireCourbe(courbeBrut, COUCHER_DEFAUT);

  if (!entities[COUCHER.courbe]) {
    return (
      <Carte>
        <p className="row-meta">
          Réglages du coucher : absents du Pi. Home Assistant n'a pas redémarré depuis le git pull (docs/MISE-A-JOUR.md).
        </p>
      </Carte>
    );
  }

  const changerLampes = (l: Lampe[]) => ecrireLumieres(ecrireLampes(l));
  // Comme au lever : un point déplacé emmène les lampes qui s'éteignaient
  // avec lui.
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

  const reglages = [COUCHER.lumieres, COUCHER.courbe, COUCHER.playlist, COUCHER.volumeDebut, SEUILS.max, SEUILS.min];
  const entiteFautive = reglages.find((id) => fautes[id]);
  const nom = (id: string) => entities[id]?.attributes.friendly_name ?? id;
  const fin = points[points.length - 1];
  const brut = entities[COUCHER.playlist]?.state;
  const playlist = !brut || brut === "unknown" || brut === "unavailable" ? "" : brut;
  const v0 = Number(entities[COUCHER.volumeDebut]?.state ?? 0);
  const resumeMusique = playlist === "aucune" ? "pas touchée"
    : `${playlist ? playlists.find((p) => p.valeur === playlist)?.nom ?? playlist : "ce qui joue"} · de ${v0 > 0 ? `${v0} %` : "son volume"} à 0`;
  const [hi, lo] = seuils(entities);

  return (
    <>
      {entiteFautive && (
        <Carte faute>
          <NoteFaute entite={entiteFautive} message={fautes[entiteFautive]} />
        </Carte>
      )}
      <Depliable id="coucher-lampes" titre="Les lumières du coucher"
                 resume={lampes.length ? lampes.map((l) => nom(l.id)).join(", ") : "celles qui sont allumées"}>
        <Lampes sens="coucher" lampes={lampes} points={points} onChange={changerLampes} />
      </Depliable>
      <Depliable id="coucher-courbe" titre="La courbe"
                 resume={`${points.length} points · de ${Math.round(points[0].b)} % à ${Math.round(fin.b)} %, puis la nuit`}>
        <Courbe sens="coucher" points={points} onChange={changerCourbe} />
      </Depliable>
      <Depliable id="coucher-musique" titre="La musique du coucher" resume={resumeMusique}>
        <Musique />
      </Depliable>
      <Depliable id="coucher-chambre" titre="Chambre trop chaude ou trop froide"
                 resume={`au-delà de ${hi} °C, en deçà de ${lo} °C`}>
        <Seuils />
      </Depliable>
    </>
  );
}

// 0, c'est « jamais réglé » : 25 et 17 °C, comme le Pi.
function seuils(entities: ReturnType<typeof useMaison>["entities"]): [number, number] {
  const hi = Number(entities[SEUILS.max]?.state ?? 0);
  const lo = Number(entities[SEUILS.min]?.state ?? 0);
  return [hi > 0 ? hi : 25, lo > 0 ? lo : 17];
}

// La musique : celle qui joue déjà, une playlist qui part avec le coucher, ou
// rien. Elle descend de son volume de départ jusqu'à zéro, puis se met en
// pause ; l'enceinte retrouve ensuite ce volume.
function Musique() {
  const { entities, agir } = useMaison();
  const [choix, ecrireChoix] = useTexte(COUCHER.playlist);
  const { playlists } = usePlaylists();
  const cap = plafond(entities);
  const connue = choix === "" || choix === "aucune" || playlists.some((p) => p.valeur === choix);
  const v0 = Number(entities[COUCHER.volumeDebut]?.state ?? 0);
  return (
    <div className="sous">
      <label className="champ">
        <span className="row-meta">Ce qui joue</span>
        <select value={choix} onChange={(e) => ecrireChoix(e.target.value)}>
          <option value="">La musique qui joue déjà</option>
          <OptionsPlaylists playlists={playlists} />
          <option value="aucune">Ne pas toucher à la musique</option>
          {!connue && <option value={choix}>{choix}</option>}
        </select>
      </label>
      <Curseur id="coucher-v0" label="Volume au départ" min={0} max={cap}
               valeur={Math.min(cap, v0)} disabled={choix === "aucune"}
               format={(v) => (Math.round(v) === 0 ? "son volume actuel" : `${Math.round(v)} %`)}
               onCommit={(v) => agir(COUCHER.volumeDebut, () => setNumber(COUCHER.volumeDebut, Math.round(v)))} />
      <p className="row-meta">puis jusqu'à zéro à la fin du coucher, et pause</p>
    </div>
  );
}

// Les seuils de la chambre : au coucher, et quand on demande la température,
// le Pi conseille d'ouvrir ou de fermer la fenêtre au-delà. L'aération s'en
// sert aussi : sous le seuil du froid, elle dit de refermer sans attendre.
function Seuils() {
  const { entities, agir } = useMaison();
  const [hi, lo] = seuils(entities);
  // Les deux écrits au premier geste, comme les volumes du réveil : l'autre
  // ne doit pas rester à 0 sans qu'on l'ait voulu.
  const ecrire = (id: string, v: number) => agir(id, async () => {
    await setNumber(SEUILS.max, id === SEUILS.max ? v : hi);
    await setNumber(SEUILS.min, id === SEUILS.min ? v : lo);
  });
  const t = Number(entities[CLIMAT.temperature]?.state);
  return (
    <div className="sous">
      <Curseur id="seuil-max" label="Trop chaud au-delà de" min={18} max={32} step={0.5} valeur={hi}
               format={(v) => `${v.toFixed(1).replace(".", ",")} °C`}
               onCommit={(v) => ecrire(SEUILS.max, Math.max(v, lo + 1))} />
      <Curseur id="seuil-min" label="Trop froid en deçà de" min={10} max={24} step={0.5} valeur={lo}
               format={(v) => `${v.toFixed(1).replace(".", ",")} °C`}
               onCommit={(v) => ecrire(SEUILS.min, Math.min(v, hi - 1))} />
      {Number.isFinite(t) && (
        <p className="row-meta">
          La chambre est à {t.toFixed(1).replace(".", ",")} °C
          {t > hi ? " : trop chaude" : t < lo ? " : trop froide" : " : ça va"}
        </p>
      )}
    </div>
  );
}
