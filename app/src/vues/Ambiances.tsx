import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useMaison } from "../maison";
import { MOODS, MOOD_SELECT } from "../config";
import { Carte, Etiquette, LigneEtat, NoteFaute, Pastille } from "../ui";
import { Reveil } from "./Reveil";

const reduit = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Le lavis part du point touché, dans la teinte de l'ambiance, et s'efface.
// Un élément éphémère hors de React : il n'a pas d'état, il a une durée.
function lavis(ev: MouseEvent<HTMLButtonElement>) {
  if (reduit()) return;
  const tuile = ev.currentTarget;
  const r = tuile.getBoundingClientRect();
  const x = ev.clientX ? ev.clientX - r.left : r.width / 2;
  const y = ev.clientY ? ev.clientY - r.top : r.height / 2;
  const portee = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
  const w = document.createElement("span");
  w.className = "wash";
  w.style.left = `${x}px`;
  w.style.top = `${y}px`;
  tuile.appendChild(w);
  const fin = () => w.remove();
  w.animate(
    [
      { transform: "scale(1)", opacity: 0.34 },
      { transform: `scale(${portee / 6})`, opacity: 0 },
    ],
    { duration: 620, easing: "cubic-bezier(.22,1,.36,1)" }
  ).finished.then(fin, fin);
}

function depuis(iso: string | undefined, maintenant: number): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `depuis ${min} min`;
  const h = Math.floor(min / 60);
  return `depuis ${h} h${min % 60 ? ` ${min % 60}` : ""}`;
}

export function Ambiances() {
  const { entities, fautes, attente, confirmee, ambiance } = useMaison();
  const select = entities[MOOD_SELECT];
  const courante = select?.state;
  const affichee = attente ?? courante;
  const mood = MOODS.find((m) => m.id === affichee);

  // « depuis 12 min » doit avancer sans qu'on touche à rien.
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fauteAmbiance = MOODS.map((m) => [m.id, fautes[m.id]] as const).find(([, f]) => f);

  return (
    <>
      <LigneEtat fort={mood ? mood.label : "Aucune ambiance"}>
        <span className="tnum">
          {attente ? "envoyé" : mood ? depuis(select?.last_changed, maintenant) : "rien n'a encore été choisi"}
        </span>
      </LigneEtat>

      <div className="moods">
        {MOODS.map((m) => {
          const on = affichee === m.id;
          const etat = attente === m.id ? " pending" : confirmee === m.id ? " settled" : "";
          return (
            <button
              key={m.id}
              className={`mood${m.wide ? " wide" : ""}${etat}`}
              style={{ "--hue": m.hue } as CSSProperties}
              aria-pressed={on}
              onClick={(ev) => {
                lavis(ev);
                ambiance(m.id);
              }}
            >
              <span className="settle" aria-hidden="true" />
              <span className="mood-name">{m.label}</span>
              <span className="mood-what">{m.what}</span>
            </button>
          );
        })}
      </div>

      {fauteAmbiance && <NoteFaute entite={fauteAmbiance[0]} message={fauteAmbiance[1]} />}

      <Etiquette>Le matin</Etiquette>
      <Reveil />
    </>
  );
}
