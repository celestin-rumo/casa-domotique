import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { HassEntity } from "home-assistant-js-websocket";
import { useMaison } from "../maison";
import { DEVICES, CLIMAT } from "../config";
import {
  toggleLight, setLight, setLights, activateScene, enregistrerScene, supprimerScene, scenePourLumieres, zonerEntite,
} from "../ha";
import { usePieces, type Piece } from "../pieces";
import { Carte, Curseur, Etiquette, Interrupteur, LigneEtat, NoteFaute, Pastille, Question, useAppuiLong } from "../ui";
import { Brosse } from "./Brossage";
import { css, hsRgb, kelvinRgb } from "../couleur";

const MODES_COULEUR = ["hs", "rgb", "xy", "rgbw", "rgbww"];

// Deux façons de dire la même chose à une ampoule : des kelvins, ou une
// teinte — les conversions vivent dans couleur.ts, partagé avec le réveil.
// La puce montre la couleur qui partirait, calculée pendant le geste, puis
// remplacée par ce que l'ampoule rapporte vraiment.

// Les pièces ouvertes, d'une visite à l'autre. Le stockage peut manquer —
// navigation privée, aperçu — : l'écran marche alors sans s'en souvenir, la
// chambre ouverte.
const CLE_OUVERTES = "casa.pieces.ouvertes";
function lireOuvertes(): string[] {
  try {
    const brut = localStorage.getItem(CLE_OUVERTES);
    if (brut) return JSON.parse(brut) as string[];
  } catch { /* rien à retenir */ }
  return ["bedroom"];
}
function ecrireOuvertes(ids: string[]) {
  try {
    localStorage.setItem(CLE_OUVERTES, JSON.stringify(ids));
  } catch { /* tant pis */ }
}

const allumee = (entities: Record<string, HassEntity | undefined>, id: string) => entities[id]?.state === "on";

// L'écran de toute la maison, pièce par pièce, telles que Home Assistant les
// range (pieces.ts). En tête, l'interrupteur de toute la maison ; puis, pour
// chaque pièce, son interrupteur, ses scènes en un toucher, et ses lampes,
// dépliées à la demande — dix-sept lampes ouvertes d'un coup ne seraient plus
// qu'une piste de curseurs.
export function Pieces() {
  const { entities, fautes, agir } = useMaison();
  const pieces = usePieces(entities);
  const [ouvertes, setOuvertes] = useState<string[]>(lireOuvertes);
  const basculer = (id: string) => {
    const suivantes = ouvertes.includes(id) ? ouvertes.filter((x) => x !== id) : [...ouvertes, id];
    setOuvertes(suivantes);
    ecrireOuvertes(suivantes);
  };

  const toutes = pieces.flatMap((p) => p.lumieres);
  const nbAllumees = toutes.filter((id) => allumee(entities, id)).length;
  const piecesAllumees = pieces.filter((p) => p.lumieres.some((id) => allumee(entities, id))).length;
  // Un geste, un sens : quelque chose d'allumé, on éteint tout ; tout noir,
  // on allume tout.
  const maisonAllumee = nbAllumees > 0;
  const MAISON = "maison";

  return (
    <>
      <LigneEtat
        fort={piecesAllumees === 0 ? "Tout est éteint" : piecesAllumees === 1 ? "1 pièce allumée" : `${piecesAllumees} pièces allumées`}
      >
        <span>· {toutes.length} lumières</span>
      </LigneEtat>

      <Temperatures pieces={pieces} />

      <Carte lit={maisonAllumee} faute={!!fautes[MAISON]}>
        <div className="row">
          <div>
            <div className="row-name">Toute la maison</div>
            <div className="row-meta">
              {toutes.length === 0 ? "aucune lampe trouvée" : `${nbAllumees} allumée${nbAllumees > 1 ? "s" : ""} sur ${toutes.length}`}
            </div>
          </div>
          <Interrupteur
            on={maisonAllumee}
            label="Toutes les lumières de la maison"
            disabled={toutes.length === 0}
            onClick={() => agir(MAISON, () => setLights(toutes, !maisonAllumee))}
          />
        </div>
        <NoteFaute entite="toutes les lumières" message={fautes[MAISON]} />
      </Carte>

      {pieces.length === 0 && <p className="astuce">Lecture des pièces de Home Assistant…</p>}

      {pieces.map((p) => (
        <CartePiece
          key={p.id}
          piece={p}
          ouverte={ouvertes.includes(p.id)}
          surOuvrir={() => basculer(p.id)}
        >
          {p.lumieres.map((id) => (
            <Lumiere
              key={id}
              id={id}
              entite={entities[id]}
              faute={fautes[id]}
              onToggle={() => agir(id, () => toggleLight(id))}
              onRegler={(r) => agir(id, () => setLight(id, r))}
            />
          ))}
        </CartePiece>
      ))}
      {pieces.length > 0 && (
        <p className="astuce">« + Ambiance » garde l'éclairage d'une pièce sous un nom. Maintiens une ambiance pour la remplacer ou la supprimer.</p>
      )}

      {DEVICES.length > 0 && (
        <>
          <Etiquette>Appareils</Etiquette>
          <Carte>
            {DEVICES.map((d) => {
              const e = entities[d.id];
              return (
                <div className="ent" key={d.id}>
                  <div>
                    <code>{d.id}</code>
                    <small>{d.label}</small>
                  </div>
                  {e ? <Pastille etat={e.state === "off" ? "todo" : "ok"}>{etatLisible(e.state)}</Pastille>
                     : <Pastille etat="miss">absente</Pastille>}
                </div>
              );
            })}
          </Carte>
        </>
      )}
    </>
  );
}

// Une pièce : son nom et ce qui y est allumé, son interrupteur toujours à
// portée de pouce, ses scènes en puces, et ses lampes une fois dépliée.
function CartePiece({ piece, ouverte, surOuvrir, children }: {
  piece: Piece;
  ouverte: boolean;
  surOuvrir: () => void;
  children: ReactNode;
}) {
  const { entities, fautes, agir } = useMaison();
  const nb = piece.lumieres.filter((id) => allumee(entities, id)).length;
  const on = nb > 0;
  const cle = `piece.${piece.id}`;
  const temperature = piece.temperature ? mesure(entities[piece.temperature]?.state, 1) : null;
  const meta = [
    piece.lumieres.length === 0 ? "aucune lampe" : nb === 0 ? `${piece.lumieres.length} éteinte${piece.lumieres.length > 1 ? "s" : ""}` : `${nb} allumée${nb > 1 ? "s" : ""} sur ${piece.lumieres.length}`,
    temperature && temperature !== "—" ? `${temperature} °C` : null,
  ].filter(Boolean).join(" · ");
  // Une teinte au liseré : celle de la première lampe allumée qui en a une.
  const teinte = piece.lumieres.map((id) => entities[id]).find((e) => e?.state === "on" && e.attributes.rgb_color);
  const style = teinte ? ({ "--room-hue": css(teinte.attributes.rgb_color) } as CSSProperties) : undefined;
  const corps = `piece-${piece.id}`;

  return (
    <div className="piece">
      <Carte lit={on} faute={!!fautes[cle]} style={style}>
        <div className="row">
          <button className="piece-tete" aria-expanded={ouverte} aria-controls={corps} onClick={surOuvrir}
                  disabled={piece.lumieres.length === 0}>
            <span className="depli-texte">
              <span className="row-name">{piece.nom}</span>
              <span className="row-meta">{meta}</span>
            </span>
            {piece.lumieres.length > 0 && (
              <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            )}
          </button>
          <Interrupteur
            on={on}
            label={`Lumières · ${piece.nom}`}
            disabled={piece.lumieres.length === 0}
            onClick={() => agir(cle, () => setLights(piece.lumieres, !on))}
          />
        </div>
        <Ambiances piece={piece} cle={cle} />
        <NoteFaute entite={piece.nom} message={fautes[cle]} />
      </Carte>
      {ouverte && piece.lumieres.length > 0 && (
        <div className="piece-corps" id={corps}>
          {children}
        </div>
      )}
      {piece.brosses.map((b) => <Brosse key={b} id={b} />)}
    </div>
  );
}

// LES AMBIANCES D'UNE PIÈCE : les scènes que Home Assistant range dans sa
// zone. Un toucher en lance une ; « + Ambiance » fige l'éclairage du moment
// sous un nom, comme nouvelle scène de la pièce ; un appui long sur une
// scène propose de la remplacer par l'éclairage du moment, ou de la
// supprimer.
//
// La scène est écrite comme le fait l'éditeur de Home Assistant (ha.ts), puis
// rangée dans la zone de la pièce : sans zone, elle existerait, mais n'aurait
// pas de pièce où apparaître.
function Ambiances({ piece, cle }: { piece: Piece; cle: string }) {
  const { entities, agir } = useMaison();
  const [creer, setCreer] = useState(false);
  const [nom, setNom] = useState("");
  const [choisie, setChoisie] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [dit, setDit] = useState<string | null>(null);
  // La scène créée attend d'exister pour être rangée : Home Assistant la
  // recharge, puis elle arrive dans les états avec son identifiant.
  const [aRanger, setARanger] = useState<string | null>(null);

  useEffect(() => {
    if (!aRanger) return;
    const e = Object.values(entities).find((x) => x.entity_id.startsWith("scene.") && x.attributes.id === aRanger);
    if (!e) return;
    setARanger(null);
    agir(cle, () => zonerEntite(e.entity_id, piece.id));
  }, [aRanger, entities, agir, cle, piece.id]);

  const lumieres = () => scenePourLumieres(piece.lumieres, entities);
  const idDe = (scene: string) => entities[scene]?.attributes.id as string | undefined;
  const nomDe = (scene: string) => (entities[scene]?.attributes.friendly_name as string | undefined) ?? scene;

  const enregistrer = async () => {
    const n = nom.trim();
    if (!n) return;
    const slug = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const id = `${piece.id}_${slug || "ambiance"}_${Date.now().toString(36)}`;
    const ok = await agir(cle, () => enregistrerScene(id, n, lumieres(), true));
    if (!ok) return;
    setARanger(id);
    setCreer(false);
    setNom("");
    setDit(`${n} : enregistrée`);
  };

  const remplacer = async (scene: string) => {
    const id = idDe(scene);
    if (!id) return;
    setChoisie(null);
    if (await agir(cle, () => enregistrerScene(id, nomDe(scene), lumieres()))) setDit(`${nomDe(scene)} : éclairage enregistré`);
  };

  const supprimer = async (scene: string) => {
    const id = idDe(scene);
    setASupprimer(null);
    setChoisie(null);
    if (!id) return;
    if (await agir(cle, () => supprimerScene(id))) setDit(`${nomDe(scene)} : supprimée`);
  };

  if (piece.scenes.length === 0 && piece.lumieres.length === 0) return null;

  return (
    <>
      <div className="chips">
        {piece.scenes.map((s) => (
          <PuceScene
            key={s}
            nom={nomDe(s)}
            choisie={choisie === s}
            surClic={() => {
              setDit(null);
              agir(cle, () => activateScene(s));
            }}
            surLong={() => setChoisie(choisie === s ? null : s)}
          />
        ))}
        {piece.lumieres.length > 0 && (
          <button className="chip ajout" aria-expanded={creer} onClick={() => setCreer(!creer)}>
            + Ambiance
          </button>
        )}
      </div>

      {creer && (
        <div className="scene-edit">
          <span className="row-meta">L'éclairage de la pièce tel qu'il est maintenant, sous un nom :</span>
          <input
            className="recherche"
            value={nom}
            maxLength={30}
            autoFocus
            placeholder="Lecture, Film, Soirée…"
            aria-label={`Nom de la nouvelle ambiance · ${piece.nom}`}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enregistrer()}
          />
          <div className="btn-row">
            <button className="btn" onClick={() => setCreer(false)}>Annuler</button>
            <button className="btn primary" disabled={!nom.trim()} onClick={enregistrer}>Enregistrer</button>
          </div>
        </div>
      )}

      {choisie && (
        <div className="scene-edit">
          <span className="row-name">{nomDe(choisie)}</span>
          {idDe(choisie) ? (
            <div className="btn-row">
              <button className="btn" onClick={() => remplacer(choisie)}>Remplacer par l'éclairage actuel</button>
              <button className="btn danger" onClick={() => setASupprimer(choisie)}>Supprimer</button>
            </div>
          ) : (
            <span className="row-meta">Cette scène n'a pas d'identifiant : elle se modifie dans Home Assistant.</span>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setChoisie(null)}>Fermer</button>
          </div>
        </div>
      )}

      {dit && <p className="row-meta" role="status">{dit}</p>}

      {aSupprimer && (
        <Question
          titre={`Supprimer ${nomDe(aSupprimer)} ?`}
          texte="La scène disparaît de Home Assistant. Rien ne permet de la retrouver ensuite."
          oui="Supprimer"
          surOui={() => supprimer(aSupprimer)}
          surNon={() => setASupprimer(null)}
        />
      )}
    </>
  );
}

function PuceScene({ nom, choisie, surClic, surLong }: {
  nom: string;
  choisie: boolean;
  surClic: () => void;
  surLong: () => void;
}) {
  const appui = useAppuiLong(surLong, surClic);
  return (
    <button className="chip" aria-pressed={choisie} {...appui}>
      {nom}
    </button>
  );
}

// Un nombre tel que le Pi le donne, avec la virgule d'ici ; « — » si le
// capteur manque ou ne répond pas, jamais un zéro qui aurait l'air vrai.
function mesure(etat: string | undefined, decimales: number): string {
  const n = Number(etat);
  if (etat === undefined || etat === "unavailable" || etat === "unknown" || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

// Les températures des pièces côte à côte, puis dehors : une tuile par
// thermomètre rangé dans une zone (pieces.ts), son humidité dessous. Plus de
// tuiles que d'écran : la rangée défile de côté.
function Temperatures({ pieces }: { pieces: Piece[] }) {
  const { entities } = useMaison();
  const avec = pieces.filter((p) => p.temperature);
  const dehors = entities[CLIMAT.exterieur];
  if (avec.length === 0 && !dehors) return null;
  return (
    <div className="temperatures" role="list" aria-label="Températures">
      {avec.map((p) => (
        <div className="temp" role="listitem" key={p.id}>
          <b className="tnum">{mesure(entities[p.temperature!]?.state, 1)}<small>°C</small></b>
          <span>{p.nom}</span>
          {p.humidite && <em>{mesure(entities[p.humidite]?.state, 0)} % hum.</em>}
        </div>
      ))}
      {dehors && (
        <div className="temp dehors" role="listitem">
          <b className="tnum">{mesure(dehors.state, 0)}<small>°C</small></b>
          <span>Dehors</span>
          <em>MétéoSuisse</em>
        </div>
      )}
    </div>
  );
}

function etatLisible(s: string) {
  return { on: "allumée", off: "en veille", playing: "en lecture", paused: "en pause", idle: "prête",
           standby: "en veille", unavailable: "injoignable" }[s] ?? s;
}

// Partagée avec l'édition d'une ambiance, qui règle les mêmes lampes.
export function Lumiere({ id, entite, faute, onToggle, onRegler }: {
  id: string;
  entite: HassEntity | undefined;
  faute: string | undefined;
  onToggle: () => void;
  onRegler: (r: Parameters<typeof setLight>[1]) => void;
}) {
  const on = entite?.state === "on";
  const nom = entite?.attributes.friendly_name ?? id;
  const modes: string[] = entite?.attributes.supported_color_modes ?? [];
  const reglable = modes.some((m) => m !== "onoff" && m !== "unknown");
  const saitBlanc = modes.includes("color_temp");
  const saitCouleur = modes.some((m) => MODES_COULEUR.includes(m));
  const avance = saitBlanc || saitCouleur;

  const kelvin: number | null = entite?.attributes.color_temp_kelvin ?? null;
  const kMin: number = entite?.attributes.min_color_temp_kelvin ?? 2000;
  const kMax: number = entite?.attributes.max_color_temp_kelvin ?? 6500;
  const hs: [number, number] | null = entite?.attributes.hs_color ?? null;
  const rgb: [number, number, number] | null = entite?.attributes.rgb_color ?? null;
  const modeReel = entite?.attributes.color_mode as string | undefined;

  const [ouvert, setOuvert] = useState(false);
  // Le segment suit ce que l'ampoule fait, sauf si on a choisi l'autre onglet.
  const [modeChoisi, setModeChoisi] = useState<"blanc" | "couleur" | null>(null);
  const mode = modeChoisi ?? (modeReel && MODES_COULEUR.includes(modeReel) && saitCouleur ? "couleur" : saitBlanc ? "blanc" : "couleur");
  // Pendant le geste, la puce montre la couleur qui partirait.
  const [apercu, setApercu] = useState<[number, number, number] | null>(null);
  const [teinte, setTeinte] = useState<number | null>(null);
  const [saturation, setSaturation] = useState<number | null>(null);

  const couleur = apercu ? css(apercu) : rgb ? css(rgb) : kelvin ? css(kelvinRgb(kelvin)) : "var(--accent)";
  const meta = !entite ? "absente" : !on ? "éteinte"
    : modeReel === "color_temp" && kelvin ? `${kelvin} K`
    : modeReel && MODES_COULEUR.includes(modeReel) ? "couleur"
    : entite.attributes.brightness ? `${Math.round((entite.attributes.brightness / 255) * 100)} %` : "allumée";

  const h = teinte ?? hs?.[0] ?? 30;
  const s = saturation ?? hs?.[1] ?? 60;
  const panneau = `adv-${id.replace(".", "-")}`;
  const styleCarte = on ? ({ "--room-hue": couleur } as CSSProperties) : undefined;

  return (
    <Carte lit={on} faute={!!faute} style={styleCarte}>
      <div className="row">
        <div>
          <div className="row-name">{nom}</div>
          <div className="row-meta">{meta}</div>
        </div>
        <Interrupteur on={on} label={`Lumières · ${nom}`} onClick={onToggle} disabled={!entite} />
      </div>

      <NoteFaute entite={id} message={faute} />

      {reglable && (
        <Curseur
          id={`${panneau}-int`}
          label="Intensité"
          min={1}
          max={100}
          valeur={Math.round(((entite?.attributes.brightness ?? 0) / 255) * 100)}
          onCommit={(pct) => onRegler({ brightness: Math.max(1, Math.round((pct / 100) * 255)) })}
          style={{ "--thumb": couleur } as CSSProperties}
        />
      )}

      {avance && (
        <button className="adv-toggle" aria-expanded={ouvert} aria-controls={panneau} onClick={() => setOuvert(!ouvert)}>
          <span>Avancé</span>
          <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}

      {avance && ouvert && (
        <div className="adv open" id={panneau}>
          {saitBlanc && saitCouleur && (
            <div className="seg" role="tablist" aria-label="Mode">
              <button className="seg-b" role="tab" aria-selected={mode === "blanc"} onClick={() => setModeChoisi("blanc")}>Blanc</button>
              <button className="seg-b" role="tab" aria-selected={mode === "couleur"} onClick={() => setModeChoisi("couleur")}>Couleur</button>
            </div>
          )}

          {mode === "blanc" && saitBlanc && (
            <Curseur
              id={`${panneau}-k`}
              label="Température"
              className="k-range"
              min={kMin}
              max={kMax}
              step={50}
              valeur={kelvin ?? 2700}
              format={(v) => `${Math.round(v)} K`}
              onApercu={(v) => setApercu(kelvinRgb(v))}
              onCommit={(v) => { setApercu(null); onRegler({ color_temp_kelvin: Math.round(v) }); }}
              style={{ "--thumb": couleur } as CSSProperties}
            />
          )}

          {mode === "couleur" && saitCouleur && (
            <>
              <Curseur
                id={`${panneau}-h`}
                label="Teinte"
                className="h-range"
                min={0}
                max={360}
                valeur={h}
                format={(v) => `${Math.round(v)}°`}
                onApercu={(v) => { setTeinte(v); setApercu(hsRgb(v, s)); }}
                onCommit={(v) => { setApercu(null); setTeinte(null); onRegler({ hs_color: [Math.round(v), Math.round(s)] }); }}
                style={{ "--thumb": couleur } as CSSProperties}
              />
              <Curseur
                id={`${panneau}-s`}
                label="Saturation"
                min={10}
                max={100}
                valeur={s}
                onApercu={(v) => { setSaturation(v); setApercu(hsRgb(h, v)); }}
                onCommit={(v) => { setApercu(null); setSaturation(null); onRegler({ hs_color: [Math.round(h), Math.round(v)] }); }}
                style={{ "--thumb": couleur } as CSSProperties}
              />
            </>
          )}

          <div className="mix">
            <span className="mix-chip" style={{ background: couleur }} aria-hidden="true" />
            <span className="mix-val">
              <span>{apercu ? `[${apercu.join(", ")}]` : rgb ? `[${rgb.join(", ")}]` : "—"}</span>
              <small>{apercu ? "partira à " : "rgb_color de "}{id}</small>
            </span>
          </div>
        </div>
      )}
    </Carte>
  );
}
