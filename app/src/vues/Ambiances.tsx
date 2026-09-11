import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { MOOD_SELECT } from "../config";
import { placeLibre, placesPresentes, useAmbiances, type Ambiance } from "../ambiances";
import { LigneEtat, NoteFaute, Question, Etiquette, useAppuiLong } from "../ui";
import { Reveil } from "./Reveil";

const reduit = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Le lavis part du point touché, dans la teinte de l'ambiance, et s'efface.
// Un élément éphémère hors de React : il n'a pas d'état, il a une durée.
function lavis(ev: MouseEvent<HTMLElement>) {
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

// L'écran de tous les jours : les ambiances, puis le réveil du lendemain.
// Ce qu'on règle une fois — le lever en détail, le plafond du son,
// l'enregistrement des lumières — vit dans Réglages.
export function Ambiances() {
  const { entities, fautes, attente, confirmee, ambiance } = useMaison();
  const { ouvrir } = useNavigation();
  const ambiances = useAmbiances();
  const [aModifier, setAModifier] = useState<Ambiance | null>(null);
  const select = entities[MOOD_SELECT];
  const courante = select?.state;
  const affichee = attente ?? courante;
  const mood = ambiances.find((m) => m.id === affichee);

  // « depuis 12 min » doit avancer sans qu'on touche à rien.
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fauteAmbiance = ambiances.map((m) => [m.id, fautes[m.id]] as const).find(([, f]) => f);
  const libre = placeLibre(entities);
  const presentes = placesPresentes(entities);

  const tuile = (m: Ambiance) => (
    <Tuile
      key={m.id}
      m={m}
      on={affichee === m.id}
      etat={attente === m.id ? " pending" : confirmee === m.id ? " settled" : ""}
      surClic={(ev) => {
        lavis(ev);
        ambiance(m.id);
      }}
      // « Tout éteindre » n'a ni scène ni musique : rien à y modifier.
      surLong={m.scene ? () => setAModifier(m) : undefined}
    />
  );

  return (
    <>
      <LigneEtat fort={mood ? mood.label : "Aucune ambiance"}>
        <span className="tnum">
          {attente ? "envoyé" : mood ? depuis(select?.last_changed, maintenant) : "rien n'a encore été choisi"}
        </span>
      </LigneEtat>

      <div className="moods">
        {ambiances.filter((m) => !m.wide).map(tuile)}
        {/* La place libre : pas de question, rien n'est touché avant
            « Créer ». Grisée quand les six sont prises, ou que le Pi ne les
            a pas encore. */}
        <button
          className="mood ajout"
          disabled={!libre}
          onClick={() => libre && ouvrir({ type: "ambiance", id: libre.id, nouvelle: true })}
        >
          <span className="mood-name">
            <span aria-hidden="true">+ </span>Nouvelle
          </span>
          <span className="mood-what">
            {!presentes ? "le Pi n'a pas encore les places" : libre ? "tes lumières, ta musique, ton volume" : "les six places sont prises"}
          </span>
        </button>
        {ambiances.filter((m) => m.wide).map(tuile)}
      </div>
      <p className="astuce">Maintiens une ambiance pour la modifier : lumières, musique, volume.</p>

      {fauteAmbiance && <NoteFaute entite={fauteAmbiance[0]} message={fauteAmbiance[1]} />}

      {aModifier && (
        <Question
          titre={`Modifier ${aModifier.label} ?`}
          texte={`Les lumières passent sur ${aModifier.label}, et tu règles la pièce en direct. Rien n'est gardé avant « Enregistrer ».`}
          surOui={() => {
            setAModifier(null);
            ouvrir({ type: "ambiance", id: aModifier.id });
          }}
          surNon={() => setAModifier(null)}
        />
      )}

      <Etiquette>Le matin</Etiquette>
      <Reveil />
    </>
  );
}

// Une tuile : le clic lance l'ambiance, l'appui long propose de la modifier.
function Tuile({ m, on, etat, surClic, surLong }: {
  m: Ambiance;
  on: boolean;
  etat: string;
  surClic: (ev: MouseEvent<HTMLElement>) => void;
  surLong?: () => void;
}) {
  const appui = useAppuiLong(surLong, surClic);
  return (
    <button
      className={`mood${m.wide ? " wide" : ""}${etat}`}
      style={{ "--hue": m.hue } as CSSProperties}
      aria-pressed={on}
      {...appui}
    >
      <span className="settle" aria-hidden="true" />
      <span className="mood-name">{m.label}</span>
      <span className="mood-what">{m.what}</span>
    </button>
  );
}
