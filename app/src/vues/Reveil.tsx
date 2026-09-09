import { useEffect, useState } from "react";
import { useMaison } from "../maison";
import { REVEIL } from "../config";
import { runScript, setBoolean, setNumber, setTime } from "../ha";
import { Carte, Curseur, Interrupteur, NoteFaute } from "../ui";

// La carte du réveil, sur l'écran Ambiances. Trois réglages qui vivent sur
// le Pi — l'heure, actif ou non, la durée du lever — et deux gestes : un
// essai d'une minute pour voir la lampe monter, et « Je suis debout ».
export function Reveil() {
  const { entities, fautes, agir } = useMaison();
  const heure = entities[REVEIL.heure];
  const actif = entities[REVEIL.actif];
  const duree = entities[REVEIL.duree];
  const script = entities[REVEIL.script];
  const lampe = entities[REVEIL.lumiere];

  const present = !!(heure && actif && duree && script);
  const on = actif?.state === "on";
  const enCours = script?.state === "on";
  const hhmm = (heure?.state ?? "07:00:00").slice(0, 5);
  const minutes = Number(duree?.state ?? 20);

  // Comme le curseur : la valeur tapée reste affichée jusqu'à l'écho.
  const [locale, setLocale] = useState<string | null>(null);
  useEffect(() => setLocale(null), [hhmm]);

  const niveau = lampe?.state === "on" && lampe.attributes.brightness
    ? `${Math.round((lampe.attributes.brightness / 255) * 100)} %`
    : "";
  const meta = !present ? "absent du Pi"
    : enCours ? `le jour se lève${niveau ? ` · ${niveau}` : ""}`
    : on ? `${hhmm} · lever en ${minutes} min`
    : "désactivé";

  const faute = fautes[REVEIL.heure] ?? fautes[REVEIL.actif] ?? fautes[REVEIL.duree] ?? fautes[REVEIL.script] ?? fautes[REVEIL.stop];
  const entiteFautive = Object.values(REVEIL).find((id) => fautes[id]) ?? REVEIL.script;

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

      <div className="btn-row">
        {enCours ? (
          <button className="btn primary" onClick={() => agir(REVEIL.stop, () => runScript(REVEIL.stop))}>
            Je suis debout
          </button>
        ) : (
          // Une minute, pas vingt : de quoi voir la lampe monter sans attendre.
          <button className="btn" disabled={!present} onClick={() => agir(REVEIL.script, () => runScript(REVEIL.script, { duree: 1 }))}>
            Essai d'une minute
          </button>
        )}
      </div>
    </Carte>
  );
}
