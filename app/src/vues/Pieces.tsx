import { useState, type CSSProperties } from "react";
import type { HassEntity } from "home-assistant-js-websocket";
import { useMaison } from "../maison";
import { LIGHTS, DEVICES, CLIMAT } from "../config";
import { toggleLight, setLight } from "../ha";
import { Carte, Curseur, Etiquette, Interrupteur, LigneEtat, NoteFaute, Pastille } from "../ui";
import { css, hsRgb, kelvinRgb } from "../couleur";

const MODES_COULEUR = ["hs", "rgb", "xy", "rgbw", "rgbww"];

// Deux façons de dire la même chose à une ampoule : des kelvins, ou une
// teinte — les conversions vivent dans couleur.ts, partagé avec le réveil.
// La puce montre la couleur qui partirait, calculée pendant le geste, puis
// remplacée par ce que l'ampoule rapporte vraiment.

export function Pieces() {
  const { entities, fautes, agir } = useMaison();
  const allumees = LIGHTS.filter((id) => entities[id]?.state === "on").length;

  return (
    <>
      <LigneEtat
        fort={allumees === 0 ? "Tout est éteint" : allumees === 1 ? "1 pièce allumée" : `${allumees} pièces allumées`}
      >
        <span>· {LIGHTS.length} lumières</span>
      </LigneEtat>

      <Climat />

      {LIGHTS.map((id) => (
        <Lumiere
          key={id}
          id={id}
          entite={entities[id]}
          faute={fautes[id]}
          onToggle={() => agir(id, () => toggleLight(id))}
          onRegler={(r) => agir(id, () => setLight(id, r))}
        />
      ))}

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
  );
}

// Un nombre tel que le Pi le donne, avec la virgule d'ici ; « — » si le
// capteur manque ou ne répond pas, jamais un zéro qui aurait l'air vrai.
function mesure(etat: string | undefined, decimales: number): string {
  const n = Number(etat);
  if (etat === undefined || etat === "unavailable" || etat === "unknown" || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

// Trois chiffres, sans bouton : la pièce, son humidité, et dehors.
function Climat() {
  const { entities } = useMaison();
  const t = entities[CLIMAT.temperature];
  const h = entities[CLIMAT.humidite];
  const d = entities[CLIMAT.exterieur];
  const absents = [t, h].filter((e) => !e).length;
  return (
    <>
      <Etiquette>Climat</Etiquette>
      <Carte>
        <div className="climat">
          <div className="climat-val">
            <b className="tnum">{mesure(t?.state, 1)}</b>
            <small>°C</small>
            <span>intérieur</span>
          </div>
          <div className="climat-val">
            <b className="tnum">{mesure(h?.state, 0)}</b>
            <small>%</small>
            <span>humidité</span>
          </div>
          <div className="climat-val">
            <b className="tnum">{mesure(d?.state, 0)}</b>
            <small>°C</small>
            <span>dehors</span>
          </div>
        </div>
        {absents > 0 && (
          <p className="fault-note" role="status">
            <span>{absents === 2 ? "capteur absent" : "une mesure manque"}</span>
            <code>{!t ? CLIMAT.temperature : CLIMAT.humidite}</code>
          </p>
        )}
      </Carte>
    </>
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
